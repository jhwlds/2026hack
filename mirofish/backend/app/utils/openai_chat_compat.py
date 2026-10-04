"""
OpenAI Chat Completions compatibility helpers.

This module keeps existing behavior for legacy models/providers while
gracefully adapting request parameters for GPT-5 family models.
"""

from __future__ import annotations

import re
from typing import Any, Dict, List, Optional


# "gpt-5", "gpt-5.1", "gpt-6-luna", "gpt-10-large": a numbered GPT family from 5 on. These models take
# `max_completion_tokens` and only the default temperature, like GPT-5 (checked against gpt-6-luna).
_NUMBERED_GPT = re.compile(r"^gpt-(\d+)(?![\d])")
_FIRST_FAMILY_WITH_NEW_PARAMETERS = 5


def is_gpt5_family(model: Optional[str]) -> bool:
    """Return True for GPT-5 and later numbered GPT families (aliases and snapshots)."""
    if not model:
        return False
    match = _NUMBERED_GPT.match(model.strip().lower())
    return bool(match) and int(match.group(1)) >= _FIRST_FAMILY_WITH_NEW_PARAMETERS


_FIRST_FAMILY_REJECTING_TOOLS_WITH_REASONING = 6


def agent_model_config(model: Optional[str]) -> Dict[str, Any]:
    """
    Extra request settings for the model the simulated agents run on.

    The agents pick their actions through function tools. gpt-5.6-luna and GPT-6+ answer those requests with a 400
    unless reasoning_effort is "none", so the agents could post once and never act again. Other GPT-5 models keep
    their default configuration.
    """
    normalized = (model or "").strip().lower()
    match = _NUMBERED_GPT.match(normalized)
    if normalized == "gpt-5.6-luna" or match and int(match.group(1)) >= _FIRST_FAMILY_REJECTING_TOOLS_WITH_REASONING:
        return {"reasoning_effort": "none"}
    return {}


def create_chat_completion(
    client: Any,
    *,
    model: str,
    messages: List[Dict[str, Any]],
    temperature: Optional[float] = None,
    max_tokens: Optional[int] = None,
    response_format: Optional[Dict[str, Any]] = None,
) -> Any:
    """
    Create a chat completion with model-specific request parameters.

    Compatibility strategy:
    - For GPT-5 family, avoid sending temperature by default.
    - For token limit, use `max_completion_tokens` on GPT-5, `max_tokens` otherwise.
    - Preserve the legacy request shape for every non-GPT-5 model/provider.
    - Propagate provider errors unchanged instead of guessing from message text.
    """
    kwargs: Dict[str, Any] = {
        "model": model,
        "messages": messages,
    }

    if response_format is not None:
        kwargs["response_format"] = response_format

    gpt5_family = is_gpt5_family(model)

    if temperature is not None and not gpt5_family:
        kwargs["temperature"] = temperature

    if max_tokens is not None:
        if gpt5_family:
            kwargs["max_completion_tokens"] = max_tokens
        else:
            kwargs["max_tokens"] = max_tokens

    return client.chat.completions.create(**kwargs)


def extract_chat_completion_text(response: Any) -> str:
    """Extract plain text from chat completion response across SDK content shapes."""
    choices = getattr(response, "choices", None) or []
    if not choices:
        return ""

    message = getattr(choices[0], "message", None)
    if message is None:
        return ""

    content = getattr(message, "content", "")

    if isinstance(content, str):
        return content

    if isinstance(content, list):
        chunks: List[str] = []
        for item in content:
            if isinstance(item, dict):
                text_obj = item.get("text")
                if isinstance(text_obj, dict):
                    text_obj = text_obj.get("value")
                if isinstance(text_obj, str):
                    chunks.append(text_obj)
                elif isinstance(item.get("content"), str):
                    chunks.append(item["content"])
                continue

            text_obj = getattr(item, "text", None)
            if isinstance(text_obj, dict):
                text_obj = text_obj.get("value")
            if isinstance(text_obj, str):
                chunks.append(text_obj)
                continue

            content_obj = getattr(item, "content", None)
            if isinstance(content_obj, str):
                chunks.append(content_obj)

        return "".join(chunks).strip()

    return str(content or "")
