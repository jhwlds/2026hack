"""
Suggests the fictional job seekers of a hiring simulation for an uploaded document.
"""

import os
import re
import tempfile

from flask import jsonify, request

from . import simulation_bp
from ..config import Config
from ..services.applicant_generator import (
    APPLICANT_COUNT, ApplicantGenerationError, ApplicantGenerator, check_count,
)
from ..services.text_processor import TextProcessor
from ..utils.file_parser import FileParser
from ..utils.logger import get_logger

logger = get_logger('mirofish.api.applicants')


def _error(message: str, status: int):
    return jsonify({"success": False, "error": message}), status


@simulation_bp.route('/suggest-applicants', methods=['POST'])
def suggest_applicants():
    """
    Generate fictional job seekers (name, situation, persona) for an uploaded document.

    multipart/form-data: file (the world seed), simulation_requirement (the question to simulate),
    count (optional, how many job seekers, 2 to 8, default 4)
    """
    requirement = request.form.get('simulation_requirement', '').strip()
    upload = request.files.get('file')
    if not requirement:
        return _error("simulation_requirement is required.", 400)
    raw_count = request.form.get('count')
    try:
        count = APPLICANT_COUNT if raw_count is None else check_count(int(raw_count))
    except (ValueError, ApplicantGenerationError):  # int() raises ValueError for "abc" and "4.5"
        return _error("The number of job seekers must be a whole number between 2 and 8.", 400)
    if not upload or not upload.filename:
        return _error("A file is required.", 400)

    extension = os.path.splitext(upload.filename)[1].lower().lstrip('.')
    if extension not in Config.ALLOWED_EXTENSIONS:
        return _error(
            f"Unsupported file type .{extension}; supported types are {', '.join(sorted(Config.ALLOWED_EXTENSIONS))}.",
            400,
        )

    try:
        with tempfile.TemporaryDirectory() as folder:
            path = os.path.join(folder, f"seed.{extension}")
            upload.save(path)
            document_text = TextProcessor.preprocess_text(FileParser.extract_text(path))
        if not document_text.strip():
            return _error("The file has no readable text.", 400)

        applicants = ApplicantGenerator().generate(document_text, requirement, count)
        return jsonify({"success": True, "data": {"applicants": applicants}})

    except ApplicantGenerationError as error:
        logger.warning("Applicant generation rejected: %s", error)
        return _error(str(error), 502)
    except Exception as error:
        provider_status = getattr(error, "status_code", None)
        # Provider exception bodies may echo request content, so only the status is reported.
        if isinstance(provider_status, int):
            safe = f"LLM provider request failed (HTTP {provider_status})"
            status = 502
        else:
            safe = "Could not generate job seekers."
            status = 500
        logger.error("Applicant generation failed: type=%s status=%s", type(error).__name__, provider_status)
        return _error(safe, status)
