from types import SimpleNamespace

import pytest

from app.utils.openai_chat_compat import (
    create_chat_completion,
    agent_model_config,
    extract_chat_completion_text,
    is_gpt5_family,
)


class CompletionRecorder:
    def __init__(self, result=None, error=None):
        self.result = result or object()
        self.error = error
        self.calls = []

    def create(self, **kwargs):
        self.calls.append(kwargs)
        if self.error is not None:
            raise self.error
        return self.result


def client_for(recorder):
    return SimpleNamespace(chat=SimpleNamespace(completions=recorder))


def test_gpt5_uses_completion_token_limit_without_temperature():
    recorder = CompletionRecorder()
    messages = [{"role": "user", "content": "hello"}]

    result = create_chat_completion(
        client_for(recorder),
        model="gpt-5-2025-08-07",
        messages=messages,
        temperature=0.2,
        max_tokens=123,
        response_format={"type": "json_object"},
    )

    assert result is recorder.result
    assert recorder.calls == [
        {
            "model": "gpt-5-2025-08-07",
            "messages": messages,
            "max_completion_tokens": 123,
            "response_format": {"type": "json_object"},
        }
    ]


def test_legacy_model_preserves_original_request_shape():
    recorder = CompletionRecorder()
    messages = [{"role": "user", "content": "hello"}]

    create_chat_completion(
        client_for(recorder),
        model="third-party-chat-model",
        messages=messages,
        temperature=0.7,
        max_tokens=456,
        response_format={"type": "json_object"},
    )

    assert recorder.calls == [
        {
            "model": "third-party-chat-model",
            "messages": messages,
            "temperature": 0.7,
            "max_tokens": 456,
            "response_format": {"type": "json_object"},
        }
    ]


def test_provider_error_is_propagated_without_guessing_or_retrying():
    provider_error = RuntimeError("unsupported max_tokens due to a server outage")
    recorder = CompletionRecorder(error=provider_error)

    with pytest.raises(RuntimeError) as captured:
        create_chat_completion(
            client_for(recorder),
            model="legacy-model",
            messages=[],
            max_tokens=10,
        )

    assert captured.value is provider_error
    assert len(recorder.calls) == 1


@pytest.mark.parametrize(
    ("model", "expected"),
    [
        ("gpt-5", True),
        (" GPT-5.1-mini ", True),
        ("gpt-4.1", False),
        ("my-gpt-5-proxy", False),
        (None, False),
    ],
)
def test_gpt5_family_detection(model, expected):
    assert is_gpt5_family(model) is expected


def test_extracts_text_from_supported_content_shapes():
    response = SimpleNamespace(
        choices=[
            SimpleNamespace(
                message=SimpleNamespace(
                    content=[
                        {"text": {"value": "first"}},
                        {"content": " second"},
                        SimpleNamespace(text=" third"),
                    ]
                )
            )
        ]
    )

    assert extract_chat_completion_text(response) == "first second third"
    assert extract_chat_completion_text(SimpleNamespace(choices=[])) == ""


@pytest.mark.parametrize(
    "model",
    ["gpt-5", "GPT-5", " gpt-5.1 ", "gpt-5-2025-08-07", "gpt-6-luna", "gpt-6.0-luna", "gpt-7", "gpt-10-large"],
)
def test_gpt5_and_later_numbered_families_need_the_gpt5_request_shape(model):
    assert is_gpt5_family(model)


@pytest.mark.parametrize(
    "model",
    [
        "gpt-4o-mini", "gpt-4.1", "gpt-4", "gpt-4-turbo", "gpt-3.5-turbo",
        "gpt-", "gpt", "gpt-x", "gpt-luna", "mygpt-6", "qwen-plus", "third-party-chat-model", "", None,
    ],
)
def test_earlier_and_unrelated_models_keep_the_legacy_request_shape(model):
    assert not is_gpt5_family(model)


def test_a_later_family_model_gets_max_completion_tokens_and_no_temperature():
    recorder = CompletionRecorder()
    messages = [{"role": "user", "content": "hello"}]

    create_chat_completion(
        client_for(recorder),
        model="gpt-6-luna",
        messages=messages,
        temperature=0.3,
        max_tokens=789,
        response_format={"type": "json_object"},
    )

    assert recorder.calls == [
        {
            "model": "gpt-6-luna",
            "messages": messages,
            "max_completion_tokens": 789,
            "response_format": {"type": "json_object"},
        }
    ]


# The simulated agents choose their actions through function tools. gpt-6-luna rejects tools unless reasoning_effort is
# "none" ("Function tools with reasoning_effort are not supported ... set reasoning_effort to 'none'"). That value was
# checked on gpt-6 only; GPT-5 accepts tools with its default reasoning, so it must be left alone.
@pytest.mark.parametrize("model", ["gpt-6-luna", "gpt-6.0-luna", " GPT-6 ", "gpt-7", "gpt-10-large"])
def test_gpt6_and_later_agents_turn_reasoning_off_so_function_tools_work(model):
    assert agent_model_config(model) == {"reasoning_effort": "none"}


@pytest.mark.parametrize(
    "model",
    ["gpt-5", "gpt-5.1", "gpt-5-2025-08-07", "gpt-4o-mini", "gpt-4.1", "qwen-plus", "third-party-chat-model", "gpt-luna", "", None],
)
def test_every_other_model_keeps_the_default_agent_configuration(model):
    assert agent_model_config(model) == {}


def test_each_call_returns_its_own_dict_so_a_caller_cannot_change_the_next_one():
    first = agent_model_config("gpt-6-luna")
    first["temperature"] = 0.5
    assert agent_model_config("gpt-6-luna") == {"reasoning_effort": "none"}
