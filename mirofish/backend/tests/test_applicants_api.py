import io

import pytest

from app import create_app
from app.api import applicants as applicants_api
from app.services.applicant_generator import ApplicantGenerationError

APPLICANTS = [
    {"name": "Alex", "situation": "s" * 30, "persona": "p" * 50},
    {"name": "Jordan", "situation": "t" * 30, "persona": "q" * 50},
    {"name": "Taylor", "situation": "u" * 30, "persona": "r" * 50},
    {"name": "Riley", "situation": "v" * 30, "persona": "w" * 50},
]


def _post(client, file=True, requirement="What will candidates think?", name="posting.md", body=b"A short posting."):
    data = {}
    if requirement is not None:
        data["simulation_requirement"] = requirement
    if file:
        data["file"] = (io.BytesIO(body), name)
    return client.post("/api/simulation/suggest-applicants", data=data, content_type="multipart/form-data")


@pytest.fixture
def client():
    app = create_app()
    app.config.update(TESTING=True)
    return app.test_client()


def test_returns_the_generated_applicants_for_the_uploaded_file(client, monkeypatch):
    seen = {}

    class Generator:
        def generate(self, document_text, requirement):
            seen["document"], seen["requirement"] = document_text, requirement
            return APPLICANTS

    monkeypatch.setattr(applicants_api, "ApplicantGenerator", Generator)

    response = _post(client)

    assert response.status_code == 200
    assert response.json == {"success": True, "data": {"applicants": APPLICANTS}}
    assert "A short posting." in seen["document"]
    assert seen["requirement"] == "What will candidates think?"


def test_the_requirement_is_required(client):
    response = _post(client, requirement="   ")
    assert response.status_code == 400
    assert response.json["success"] is False


def test_the_file_is_required(client):
    assert _post(client, file=False).status_code == 400


def test_an_unsupported_file_type_is_rejected(client):
    response = _post(client, name="posting.docx")
    assert response.status_code == 400
    assert "docx" in response.json["error"].lower() or "supported" in response.json["error"].lower()


def test_an_empty_document_is_rejected(client, monkeypatch):
    class Generator:
        def generate(self, document_text, requirement):
            raise AssertionError("must not be called without document text")

    monkeypatch.setattr(applicants_api, "ApplicantGenerator", Generator)

    assert _post(client, body=b"   ").status_code == 400


def test_a_generation_failure_is_a_502_with_a_safe_message(client, monkeypatch):
    class Generator:
        def generate(self, document_text, requirement):
            raise ApplicantGenerationError("The model returned 3 applicants; exactly 4 are required.")

    monkeypatch.setattr(applicants_api, "ApplicantGenerator", Generator)

    response = _post(client)

    assert response.status_code == 502
    assert response.json["success"] is False
    assert "exactly 4" in response.json["error"]
    assert "traceback" not in response.json


def test_a_provider_error_body_is_not_exposed(client, monkeypatch):
    class ProviderError(RuntimeError):
        status_code = 401
        body = {"error": {"message": "SECRET-PROVIDER-BODY"}}

    class Generator:
        def generate(self, document_text, requirement):
            raise ProviderError("SECRET-PROVIDER-BODY")

    monkeypatch.setattr(applicants_api, "ApplicantGenerator", Generator)

    response = _post(client)

    assert response.status_code == 502
    assert "SECRET-PROVIDER-BODY" not in response.get_data(as_text=True)
    assert "401" in response.json["error"]


def test_a_missing_llm_key_is_reported_without_a_traceback(client, monkeypatch):
    def no_key():
        raise ValueError("LLM_API_KEY 未配置")

    monkeypatch.setattr(applicants_api, "ApplicantGenerator", no_key)

    response = _post(client)

    assert response.status_code == 500
    assert response.json["success"] is False
    assert "traceback" not in response.json
