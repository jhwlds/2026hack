import csv
import json

from app.services.oasis_profile_generator import (
    OasisAgentProfile,
    OasisProfileGenerator,
    _coerce_to_str,
    _coerce_to_str_list,
)


def test_text_coercion_handles_none_nested_objects_and_lists():
    assert _coerce_to_str(None) == ""
    assert _coerce_to_str({"text": {"value": "中文"}}) == "中文"
    assert _coerce_to_str([None, {"description": "alpha"}, ["beta"]]) == "alpha, beta"
    assert _coerce_to_str({"unexpected": None}) == '{"unexpected": null}'


def test_list_coercion_flattens_nested_values_and_drops_missing_items():
    assert _coerce_to_str_list(
        ["AI", ["policy", None], {"name": "society"}, 4]
    ) == ["AI", "policy", "society", "4"]
    assert _coerce_to_str_list(None) == []


def test_profile_construction_is_the_single_normalization_boundary():
    profile = OasisAgentProfile(
        user_id=1,
        user_name="agent",
        name="Agent Name",
        bio=None,
        persona={"text": {"value": "详细人设"}},
        gender=["female"],
        mbti={"value": "INTJ"},
        country={"name": "中国"},
        profession={"description": "研究员"},
        interested_topics=["AI", ["政策", None], {"name": "社会"}],
    )

    assert profile.bio == "Agent Name"
    assert profile.persona == "详细人设"
    assert profile.gender == "female"
    assert profile.mbti == "INTJ"
    assert profile.country == "United States"  # the country is fixed, whatever the model wrote
    assert profile.profession == "研究员"
    assert profile.interested_topics == ["AI", "政策", "社会"]
    assert "None" not in json.dumps(profile.to_dict(), ensure_ascii=False)


def test_normalized_profile_serializes_to_twitter_and_reddit(tmp_path):
    profile = OasisAgentProfile(
        user_id=1,
        user_name="agent",
        name="Agent Name",
        bio={"summary": "公开简介"},
        persona=["详细", "人设"],
        mbti={"text": "ENFP"},
        interested_topics=["AI", ["政策"]],
    )
    generator = object.__new__(OasisProfileGenerator)
    twitter_path = tmp_path / "twitter_profiles.csv"
    reddit_path = tmp_path / "reddit_profiles.json"

    generator._save_twitter_csv([profile], str(twitter_path))
    generator._save_reddit_json([profile], str(reddit_path))

    with twitter_path.open(encoding="utf-8") as handle:
        twitter = next(csv.DictReader(handle))
    reddit = json.loads(reddit_path.read_text(encoding="utf-8"))[0]

    assert twitter["description"] == "公开简介"
    assert twitter["user_char"] == "公开简介 详细, 人设"
    assert reddit["bio"] == "公开简介"
    assert reddit["persona"] == "详细, 人设"
    assert reddit["mbti"] == "ENFP"
    assert reddit["interested_topics"] == ["AI", "政策"]


def _profile(country):
    return OasisAgentProfile(
        user_id=1, user_name="agent", name="Agent", bio="b", persona="p", country=country
    )


def test_every_profile_is_placed_in_the_united_states():
    for given in ["中国", "South Korea", {"name": "Japan"}, "", None]:
        assert _profile(given).country == "United States"


def test_the_country_is_united_states_in_every_exported_format(tmp_path):
    profile = _profile("中国")
    generator = object.__new__(OasisProfileGenerator)
    reddit_path = tmp_path / "reddit.json"

    generator._save_reddit_json([profile], str(reddit_path))

    assert profile.to_dict()["country"] == "United States"
    assert profile.to_reddit_format()["country"] == "United States"
    assert profile.to_twitter_format()["country"] == "United States"
    assert json.loads(reddit_path.read_text(encoding="utf-8"))[0]["country"] == "United States"
    # the Twitter CSV has no country column at all, so there is nothing in it to fix


def test_fallback_profiles_are_also_in_the_united_states():
    generator = object.__new__(OasisProfileGenerator)
    for entity_type in ["Student", "Expert", "MediaOutlet", "University", "SomethingElse"]:
        data = generator._generate_profile_rule_based("Name", entity_type, "summary", {})
        assert data["country"] == "United States", entity_type


def test_the_model_is_told_the_country_instead_of_asked_for_it_in_chinese():
    from app.services import oasis_profile_generator as module

    text = open(module.__file__, encoding="utf-8").read()
    assert "使用中文，如\"中国\"" not in text
