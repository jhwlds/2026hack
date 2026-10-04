import pytest

from app.services.applicant_generator import (
    APPLICANT_COUNT,
    MAX_APPLICANTS,
    MIN_APPLICANTS,
    ApplicantGenerationError,
    ApplicantGenerator,
    validate_applicants,
)

DOC = "Neighbor is building a hyperlocal marketplace. Dana Okafor leads the platform team."
REQUIREMENT = "How will candidates react to this job posting?"


def _applicant(name, situation, persona):
    return {"name": name, "situation": situation, "persona": persona}


def _good():
    return [
        _applicant(
            "Alex",
            "Is finishing a degree and applying for a first engineering job while building a portfolio.",
            "Alex is curious and a little anxious about proving themselves. Alex reads every posting closely, "
            "asks careful questions in forums and appreciates employers who explain their process.",
        ),
        _applicant(
            "Jordan",
            "Works full-time at a larger company and looks for a better role in the evenings and on weekends.",
            "Jordan is pragmatic and guards their limited free time. Jordan compares offers methodically and "
            "writes short, direct forum replies that weigh effort against the likely reward.",
        ),
        _applicant(
            "Taylor",
            "Has several interviews scheduled across different startups in the same fortnight and must prioritise.",
            "Taylor is organised, outspoken and well connected to other candidates. Taylor shares tips freely, "
            "keeps a spreadsheet of every process and pushes back when a company asks for too much.",
        ),
        _applicant(
            "Riley",
            "Recently relocated and wants to understand a company's culture and growth before committing to it.",
            "Riley is thoughtful and values transparency over salary. Riley asks what the first year looks like "
            "and trusts companies more when expectations are written down plainly.",
        ),
    ]


_SITUATIONS = [
    "Is finishing a degree and applying for a first engineering job while building a portfolio.",
    "Works full-time at a larger company and looks for a better role in the evenings and on weekends.",
    "Has several interviews scheduled across different startups in the same fortnight and must prioritise.",
    "Recently relocated and wants to understand a company's culture and growth before committing to it.",
    "Returned to the workforce after a long break and needs a gentle ramp into a new team.",
    "Freelances for several clients and would only join a company offering real technical ownership.",
    "Switched careers through a bootcamp and wants a mentor more than a high salary.",
    "Manages a small team today and wants to return to hands-on engineering work.",
]
_NAMES = ["Alex", "Jordan", "Taylor", "Riley", "Morgan", "Casey", "Jamie", "Avery"]


def _many(count):
    return [
        _applicant(
            _NAMES[i],
            _SITUATIONS[i],
            f"{_NAMES[i]} is a thoughtful candidate number {i} who reads postings closely and writes careful, "
            "specific replies in forums about how a company treats the people it hires.",
        )
        for i in range(count)
    ]


class FakeClient:
    def __init__(self, *replies):
        self.replies = list(replies)
        self.calls = []

    def chat_json(self, messages, temperature=0.3, max_tokens=4096, max_attempts=1):
        self.calls.append({"messages": messages, "temperature": temperature})
        return self.replies.pop(0)


def _text(call):
    return "\n".join(m["content"] for m in call["messages"])


# ---- validate_applicants -------------------------------------------------------------------------------------------


def test_valid_applicants_are_returned_trimmed_with_only_the_three_fields():
    raw = _good()
    raw[0]["name"] = "  Alex "
    raw[0]["extra"] = "ignored"

    result = validate_applicants(raw, DOC)

    assert len(result) == APPLICANT_COUNT == 4
    assert result[0]["name"] == "Alex"
    assert set(result[0]) == {"name", "situation", "persona"}


@pytest.mark.parametrize("count", [0, 3, 5])
def test_the_number_of_applicants_must_be_exactly_four(count):
    raw = (_good() * 2)[:count]
    with pytest.raises(ApplicantGenerationError, match="exactly 4"):
        validate_applicants(raw, DOC)


@pytest.mark.parametrize("raw", [None, "text", {"applicants": []}, [None, None, None, None]])
def test_a_response_that_is_not_a_list_of_objects_is_rejected(raw):
    with pytest.raises(ApplicantGenerationError):
        validate_applicants(raw, DOC)


def test_names_must_be_unique_ignoring_case():
    raw = _good()
    raw[1]["name"] = "ALEX"
    with pytest.raises(ApplicantGenerationError, match="unique"):
        validate_applicants(raw, DOC)


@pytest.mark.parametrize("bad", ["", "  ", "Alex Smith", "Alex2", "A", "X" * 30, "Al_ex", 7, None])
def test_a_name_must_be_one_plain_first_name(bad):
    raw = _good()
    raw[0]["name"] = bad
    with pytest.raises(ApplicantGenerationError, match="name"):
        validate_applicants(raw, DOC)


def test_a_name_may_contain_an_apostrophe_or_hyphen():
    raw = _good()
    raw[0]["name"] = "Mary-Jane"
    raw[1]["name"] = "O'Neil"
    assert [a["name"] for a in validate_applicants(raw, DOC)][:2] == ["Mary-Jane", "O'Neil"]


def test_a_name_must_not_be_a_person_who_appears_in_the_document():
    raw = _good()
    raw[2]["name"] = "Dana"
    with pytest.raises(ApplicantGenerationError, match="Dana"):
        validate_applicants(raw, DOC)


@pytest.mark.parametrize("field", ["situation", "persona"])
@pytest.mark.parametrize("bad", ["", "short", None, 5, ["list"]])
def test_situation_and_persona_must_be_real_sentences(field, bad):
    raw = _good()
    raw[0][field] = bad
    with pytest.raises(ApplicantGenerationError, match=field):
        validate_applicants(raw, DOC)


def test_two_applicants_in_nearly_the_same_situation_are_rejected():
    raw = _good()
    raw[1]["situation"] = raw[0]["situation"].replace("Is finishing", "Is completing")
    with pytest.raises(ApplicantGenerationError, match="different"):
        validate_applicants(raw, DOC)


@pytest.mark.parametrize(
    "phrase",
    [
        "She is very careful.",
        "He is very careful.",
        "Her friends help a lot.",
        "A woman who is careful.",
        "Someone aged 25 and careful.",
        "A 25-year-old who is careful.",
        "Careful, 30 years old.",
        "Their ethnicity shapes this.",
        "A devout religion follower.",
        "An immigrant who is careful.",
    ],
)
def test_gender_age_and_background_are_rejected_in_the_persona(phrase):
    raw = _good()
    raw[3]["persona"] = raw[3]["persona"] + " " + phrase
    with pytest.raises(ApplicantGenerationError, match="gender, age"):
        validate_applicants(raw, DOC)


def test_neutral_pronouns_and_ordinary_words_are_not_mistaken_for_demographics():
    raw = _good()
    raw[3]["persona"] += " They manage their time well and the shell script they wrote helps them."
    raw[3]["situation"] += " It has been several years since the last role."
    assert len(validate_applicants(raw, DOC)) == 4


# ---- ApplicantGenerator --------------------------------------------------------------------------------------------


def test_generate_returns_the_validated_applicants_with_one_call():
    client = FakeClient({"applicants": _good()})

    result = ApplicantGenerator(client).generate(DOC, REQUIREMENT)

    assert [a["name"] for a in result] == ["Alex", "Jordan", "Taylor", "Riley"]
    assert len(client.calls) == 1
    assert client.calls[0]["temperature"] >= 0.7  # variety matters more than determinism here


def test_the_prompt_carries_the_document_and_the_question_and_forbids_demographics():
    client = FakeClient({"applicants": _good()})

    ApplicantGenerator(client).generate(DOC, REQUIREMENT)
    prompt = _text(client.calls[0])

    assert "hyperlocal marketplace" in prompt
    assert REQUIREMENT in prompt
    assert "exactly 4" in prompt
    for rule in ["age", "gender", "nationality", "they"]:
        assert rule in prompt.lower()
    assert "persona" in prompt.lower()
    assert "do not assume" in prompt.lower()  # the applicants must not presuppose the policy in the question


def test_a_long_document_is_cut_before_it_reaches_the_model():
    client = FakeClient({"applicants": _good()})

    ApplicantGenerator(client).generate("word " * 20_000, REQUIREMENT)

    assert len(_text(client.calls[0])) < 20_000


def test_an_invalid_first_answer_is_retried_once_with_the_reason():
    bad = _good()[:3]
    client = FakeClient({"applicants": bad}, {"applicants": _good()})

    result = ApplicantGenerator(client).generate(DOC, REQUIREMENT)

    assert len(result) == 4
    assert len(client.calls) == 2
    assert "exactly 4" in _text(client.calls[1])  # the validator's complaint is fed back


def test_two_invalid_answers_in_a_row_raise_with_the_last_reason():
    client = FakeClient({"applicants": _good()[:2]}, {"applicants": _good()[:3]})

    with pytest.raises(ApplicantGenerationError, match="exactly 4"):
        ApplicantGenerator(client).generate(DOC, REQUIREMENT)

    assert len(client.calls) == 2  # no endless loop


@pytest.mark.parametrize("reply", [{}, {"people": _good()}, {"applicants": "none"}, [], None])
def test_a_reply_without_an_applicants_list_is_an_error(reply):
    client = FakeClient(reply, reply)

    with pytest.raises(ApplicantGenerationError):
        ApplicantGenerator(client).generate(DOC, REQUIREMENT)


# ---- a chosen number of applicants ---------------------------------------------------------------------------------


def test_the_default_and_the_limits():
    assert (MIN_APPLICANTS, APPLICANT_COUNT, MAX_APPLICANTS) == (2, 4, 8)


@pytest.mark.parametrize("count", [2, 3, 6, 8])
def test_validate_accepts_exactly_the_requested_number(count):
    assert len(validate_applicants(_many(count), DOC, count)) == count


def test_validate_rejects_a_different_number_than_the_requested_one():
    with pytest.raises(ApplicantGenerationError, match="exactly 6"):
        validate_applicants(_many(4), DOC, 6)
    with pytest.raises(ApplicantGenerationError, match="exactly 3"):
        validate_applicants(_many(4), DOC, 3)


def test_the_generator_asks_the_model_for_the_requested_number():
    client = FakeClient({"applicants": _many(6)})

    result = ApplicantGenerator(client).generate(DOC, REQUIREMENT, 6)

    prompt = _text(client.calls[0])
    assert len(result) == 6
    assert "exactly 6" in prompt
    assert "exactly 4" not in prompt


def test_the_generator_asks_for_four_when_no_number_is_given():
    client = FakeClient({"applicants": _good()})

    ApplicantGenerator(client).generate(DOC, REQUIREMENT)

    assert "exactly 4" in _text(client.calls[0])


@pytest.mark.parametrize("bad", [0, 1, 9, 100, -3, 4.5, "4", None, True])
def test_a_count_outside_the_limits_never_reaches_the_model(bad):
    client = FakeClient({"applicants": _good()})

    with pytest.raises(ApplicantGenerationError, match="between 2 and 8"):
        ApplicantGenerator(client).generate(DOC, REQUIREMENT, bad)

    assert client.calls == []


def test_more_applicants_get_more_room_in_the_reply():
    client = FakeClient({"applicants": _many(8)}, {"applicants": _many(2)})

    ApplicantGenerator(client).generate(DOC, REQUIREMENT, 8)
    ApplicantGenerator(client).generate(DOC, REQUIREMENT, 2)
