"""
Generates the fictional job seekers of a hiring simulation from the uploaded document.

A job posting describes a company, not the people who read it, so the simulated world has no job seekers unless
they are added. The model proposes a few, each with a persona; the result is validated here because everything
downstream (graph extraction, agent creation) depends on it being well formed and varied.
"""

import re
from typing import Any, Dict, List, Optional

from ..utils.llm_client import LLMClient
from ..utils.locale import get_language_instruction

APPLICANT_COUNT = 4
MAX_DOCUMENT_CHARS = 6000

_NAME = re.compile(r"^[A-Za-z][A-Za-z'\-]{1,23}$")
_WORD = re.compile(r"[a-z0-9']+")

# Gender, age and background are not allowed in a persona: a persona describes a job-search situation and a way of
# thinking. Neutral pronouns ("they") and ordinary words that merely contain these letters are fine.
_DEMOGRAPHICS = re.compile(
    r"\b(?:he|she|him|her|hers|his|himself|herself|male|female|man|men|woman|women|boy|girl|gentleman|lady|"
    r"aged?|\d{1,3}[- ]years?[- ]old|years? old|ethnic\w*|race|racial|religio\w*|nationality|immigrants?|"
    r"native[- ]born|born in)\b",
    re.IGNORECASE,
)

# Two applicants whose situations share this much of their wording are not different enough.
_MAX_SITUATION_OVERLAP = 0.6

SYSTEM_PROMPT = f"""You design fictional job seekers for a social-media simulation of how candidates react to a company's \
hiring process. You are given a document about a company or role (for example a job posting) and a question the \
simulation will answer.

Create exactly {APPLICANT_COUNT} different fictional INDIVIDUAL job seekers who might realistically be reading about this \
company in an online job-seeker community.

Rules:
- Each job seeker differs from the others in their job-search situation: how far along they are, how much time they \
have, how much experience they have, what they prioritise, and how they behave in a forum. No two may be in the same \
situation.
- Give each one a persona: personality, how they judge a hiring process, and how they write in a forum. Make it \
specific to the kind of company and role in the document.
- Do not assume anything about the question or about the company's hiring policy. The question will be put to them \
later; do not mention it or hint at an opinion about it.
- Do not mention age, gender, ethnicity, race, religion, nationality or where anyone was born. Do not use gendered \
pronouns: refer to each person by name, or use "they".
- Each name is one ordinary first name that does not suggest a gender, is different from the others, and is not the \
name of anyone in the document.
- Everything is fictional; do not use real people.

Reply with JSON only, in this shape:
{{"applicants": [{{"name": "...", "situation": "one or two sentences", "persona": "three or four sentences"}}]}}"""


class ApplicantGenerationError(ValueError):
    """The model's applicants cannot be used; the message says why and is safe to show."""


def _words(text: str) -> set:
    return set(_WORD.findall(text.lower()))


def validate_applicants(raw: Any, document_text: str = "") -> List[Dict[str, str]]:
    if not isinstance(raw, list) or len(raw) != APPLICANT_COUNT:
        got = len(raw) if isinstance(raw, list) else "no list of"
        raise ApplicantGenerationError(
            f"The model returned {got} applicants; exactly {APPLICANT_COUNT} are required."
        )
    if not all(isinstance(item, dict) for item in raw):
        raise ApplicantGenerationError("Every applicant must be an object with a name, situation and persona.")

    document_words = _words(document_text)
    applicants: List[Dict[str, str]] = []
    for item in raw:
        fields: Dict[str, str] = {}
        for field, minimum in (("name", 2), ("situation", 20), ("persona", 40)):
            value = item.get(field)
            if not isinstance(value, str) or len(value.strip()) < minimum:
                raise ApplicantGenerationError(f"Each applicant needs a {field} of at least {minimum} characters.")
            fields[field] = value.strip()

        if not _NAME.match(fields["name"]):
            raise ApplicantGenerationError(
                f"The name {fields['name']!r} must be one plain first name (letters, apostrophe or hyphen only)."
            )
        if fields["name"].lower() in document_words:
            raise ApplicantGenerationError(f"The name {fields['name']} also appears in the document; pick another.")
        if _DEMOGRAPHICS.search(fields["situation"] + " " + fields["persona"]):
            raise ApplicantGenerationError(
                f"{fields['name']}'s description mentions gender, age or background, or uses a gendered pronoun."
            )
        applicants.append(fields)

    names = [a["name"].lower() for a in applicants]
    if len(set(names)) != len(names):
        raise ApplicantGenerationError("The applicant names must be unique.")

    for i, first in enumerate(applicants):
        for second in applicants[i + 1:]:
            a, b = _words(first["situation"]), _words(second["situation"])
            if a and b and len(a & b) / len(a | b) >= _MAX_SITUATION_OVERLAP:
                raise ApplicantGenerationError(
                    f"{first['name']} and {second['name']} are in nearly the same situation; "
                    "each applicant needs a different one."
                )
    return applicants


class ApplicantGenerator:
    def __init__(self, llm_client: Optional[LLMClient] = None):
        self.llm_client = llm_client or LLMClient()

    def generate(self, document_text: str, requirement: str) -> List[Dict[str, str]]:
        user = (
            f"Document:\n\"\"\"\n{document_text[:MAX_DOCUMENT_CHARS]}\n\"\"\"\n\n"
            f"Question the simulation will answer:\n{requirement.strip()}\n\n"
            f"Create exactly {APPLICANT_COUNT} job seekers."
        )
        messages = [
            {"role": "system", "content": f"{SYSTEM_PROMPT}\n\n{get_language_instruction()}"},
            {"role": "user", "content": user},
        ]

        error: Optional[ApplicantGenerationError] = None
        for _attempt in range(2):  # one retry, told what was wrong
            reply = self.llm_client.chat_json(messages=messages, temperature=0.8, max_tokens=2048)
            try:
                return validate_applicants(
                    reply.get("applicants") if isinstance(reply, dict) else None, document_text
                )
            except ApplicantGenerationError as e:
                error = e
                messages = messages + [
                    {"role": "assistant", "content": str(reply)[:3000]},
                    {"role": "user", "content": f"That was rejected: {e} Reply again with corrected JSON."},
                ]
        raise error
