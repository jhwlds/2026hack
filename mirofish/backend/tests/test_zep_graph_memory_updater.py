import re
from types import SimpleNamespace
import threading
from queue import Queue

import pytest

from app.services import zep_graph_memory_updater as updater_module
from app.services.zep_graph_memory_updater import (
    AgentActivity,
    ZepGraphMemoryManager,
    ZepGraphMemoryUpdater,
)


def _activity(index=1, content="hello"):
    return AgentActivity(
        platform="twitter",
        agent_id=index,
        agent_name=f"Agent {index}",
        action_type="CREATE_POST",
        action_args={"content": content},
        round_num=index,
        timestamp="2026-07-22T12:00:00+08:00",
    )


def _client(add):
    return SimpleNamespace(
        graph=SimpleNamespace(
            add=add,
            episode=SimpleNamespace(
                get=lambda **_kwargs: SimpleNamespace(processed=True)
            ),
        )
    )


def _updater(monkeypatch, add, simulation_id="sim-1"):
    client = _client(add)
    monkeypatch.setattr(updater_module, "get_zep_client", lambda _key: client)
    updater = ZepGraphMemoryUpdater(
        "graph-1",
        api_key="test-key",
        simulation_id=simulation_id,
    )
    updater.SEND_INTERVAL = 0
    return updater


def test_stop_drains_an_immediately_queued_tail_activity(monkeypatch):
    writes = []
    updater = _updater(
        monkeypatch,
        lambda **kwargs: writes.append(kwargs) or SimpleNamespace(uuid_="episode-1"),
    )

    updater.start()
    updater.add_activity(_activity())
    updater.stop()

    assert len(writes) == 1
    assert updater.get_stats()["items_sent"] == 1
    assert updater.get_stats()["queue_size"] == 0


def test_network_write_happens_outside_the_buffer_lock(monkeypatch):
    lock_was_available = []
    updater = None

    def add(**_kwargs):
        acquired = updater._buffer_lock.acquire(blocking=False)
        lock_was_available.append(acquired)
        if acquired:
            updater._buffer_lock.release()
        return SimpleNamespace(uuid_="episode-1")

    updater = _updater(monkeypatch, add)
    updater.start()
    for index in range(updater.BATCH_SIZE):
        updater.add_activity(_activity(index))
    updater.stop()

    assert lock_was_available == [True]


def test_activity_episode_has_provenance_time_and_a_safe_size(monkeypatch):
    writes = []
    updater = _updater(
        monkeypatch,
        lambda **kwargs: writes.append(kwargs) or SimpleNamespace(uuid_="episode-1"),
        simulation_id="sim-provenance",
    )

    updater._send_batch_activities(
        [_activity(content="x" * 20_000)],
        "twitter",
    )

    assert len(writes) == 1
    write = writes[0]
    assert len(write["data"]) <= updater.MAX_EPISODE_CHARS
    assert write["created_at"] == "2026-07-22T12:00:00+08:00"
    assert write["source_description"] == "MiroFish simulation activity batch"
    assert write["metadata"]["simulation_id"] == "sim-provenance"
    assert write["metadata"]["platform"] == "twitter"
    assert write["metadata"]["activity_count"] == 1


def test_failed_non_idempotent_write_is_reported_by_stop(monkeypatch):
    def add(**_kwargs):
        raise RuntimeError("write failed")

    updater = _updater(monkeypatch, add)
    updater.start()
    updater.add_activity(_activity())

    with pytest.raises(RuntimeError, match="ingestion is incomplete"):
        updater.stop()

    assert updater.get_stats()["failed_count"] == 1


def test_failed_simulation_action_is_not_ingested(monkeypatch):
    updater = _updater(
        monkeypatch,
        lambda **_kwargs: SimpleNamespace(uuid_="unused"),
    )

    updater.add_activity_from_dict(
        {
            "agent_id": 1,
            "agent_name": "Agent",
            "action_type": "CREATE_POST",
            "action_args": {"content": "not actually posted"},
            "success": False,
        },
        "twitter",
    )

    assert updater.get_stats()["queue_size"] == 0
    assert updater.get_stats()["skipped_count"] == 1


def test_stop_cannot_finish_between_acceptance_check_and_enqueue(monkeypatch):
    writes = []
    updater = _updater(
        monkeypatch,
        lambda **kwargs: writes.append(kwargs) or SimpleNamespace(uuid_="episode-1"),
    )

    put_entered = threading.Event()
    allow_put = threading.Event()

    class BlockingQueue(Queue):
        def put(self, item, block=True, timeout=None):
            put_entered.set()
            assert allow_put.wait(timeout=2)
            return super().put(item, block=block, timeout=timeout)

    updater._activity_queue = BlockingQueue()
    updater.start()
    producer = threading.Thread(target=updater.add_activity, args=(_activity(),))
    producer.start()
    assert put_entered.wait(timeout=1)

    stopper = threading.Thread(target=updater.stop)
    stopper.start()
    stopper.join(timeout=0.1)
    assert stopper.is_alive()

    allow_put.set()
    producer.join(timeout=2)
    stopper.join(timeout=2)

    assert not producer.is_alive()
    assert not stopper.is_alive()
    assert len(writes) == 1


def test_pending_episode_wait_has_a_deadline(monkeypatch):
    updater = _updater(
        monkeypatch,
        lambda **_kwargs: SimpleNamespace(uuid_="episode-1"),
    )
    updater._pending_episode_uuids = ["episode-1"]
    updater.client.graph.episode.get = lambda **_kwargs: SimpleNamespace(
        processed=False
    )
    timestamps = iter([0.0, 2.0])
    monkeypatch.setattr(updater_module, "ZEP_INGESTION_WAIT_TIMEOUT_SECONDS", 1)
    monkeypatch.setattr(updater_module.time, "time", lambda: next(timestamps))
    monkeypatch.setattr(updater_module.time, "sleep", lambda _seconds: None)

    with pytest.raises(TimeoutError, match="pending"):
        updater._wait_for_pending_episodes()


def test_explicit_graph_destruction_can_discard_a_stopped_failed_updater():
    updater = SimpleNamespace(
        graph_id="graph-1",
        _running=False,
        _worker_thread=SimpleNamespace(is_alive=lambda: False),
    )
    ZepGraphMemoryManager._updaters["sim-failed"] = updater
    try:
        assert ZepGraphMemoryManager.discard_inactive_updater("sim-failed") is True
        assert "sim-failed" not in ZepGraphMemoryManager._updaters
    finally:
        ZepGraphMemoryManager._updaters.pop("sim-failed", None)


def test_flush_deadline_keeps_unattempted_platform_for_a_safe_retry(monkeypatch):
    now = [0.0]
    writes = []

    def add(**kwargs):
        writes.append(kwargs)
        now[0] = 2.0
        return SimpleNamespace(uuid_=f"episode-{len(writes)}")

    updater = _updater(monkeypatch, add)
    updater._platform_buffers["twitter"] = [_activity(1)]
    reddit_activity = _activity(2)
    reddit_activity.platform = "reddit"
    updater._platform_buffers["reddit"] = [reddit_activity]
    monkeypatch.setattr(updater_module.time, "time", lambda: now[0])

    with pytest.raises(TimeoutError, match="deadline"):
        updater._flush_remaining(deadline=1.0)

    assert updater._platform_buffers["twitter"] == []
    assert updater._platform_buffers["reddit"] == [reddit_activity]

    now[0] = 0.0
    updater._flush_remaining(deadline=1.0)
    assert updater._platform_buffers["reddit"] == []
    assert len(writes) == 2


_CJK = re.compile(r"[㐀-䶿一-鿿]")

# One row per action type, with every optional argument present or absent, to cover each branch of the templates.
_EPISODE_CASES = [
    ("CREATE_POST", {"content": "Unpaid tasks are unfair"}),
    ("CREATE_POST", {}),
    ("LIKE_POST", {"post_content": "p", "post_author_name": "Jiho"}),
    ("LIKE_POST", {"post_content": "p"}),
    ("LIKE_POST", {"post_author_name": "Jiho"}),
    ("LIKE_POST", {}),
    ("DISLIKE_POST", {"post_content": "p", "post_author_name": "Jiho"}),
    ("DISLIKE_POST", {}),
    ("REPOST", {"original_content": "o", "original_author_name": "Jiho"}),
    ("REPOST", {"original_author_name": "Jiho"}),
    ("REPOST", {}),
    ("QUOTE_POST", {"original_content": "o", "original_author_name": "Jiho", "quote_content": "q"}),
    ("QUOTE_POST", {"original_content": "o", "quote_content": "q"}),
    ("QUOTE_POST", {"original_author_name": "Jiho"}),
    ("QUOTE_POST", {}),
    ("FOLLOW", {"target_user_name": "Jiho"}),
    ("FOLLOW", {}),
    ("CREATE_COMMENT", {"content": "c", "post_content": "p", "post_author_name": "Jiho"}),
    ("CREATE_COMMENT", {"content": "c", "post_content": "p"}),
    ("CREATE_COMMENT", {"content": "c", "post_author_name": "Jiho"}),
    ("CREATE_COMMENT", {"content": "c"}),
    ("CREATE_COMMENT", {}),
    ("LIKE_COMMENT", {"comment_content": "c", "comment_author_name": "Jiho"}),
    ("LIKE_COMMENT", {"comment_content": "c"}),
    ("LIKE_COMMENT", {"comment_author_name": "Jiho"}),
    ("LIKE_COMMENT", {}),
    ("DISLIKE_COMMENT", {"comment_content": "c", "comment_author_name": "Jiho"}),
    ("DISLIKE_COMMENT", {}),
    ("SEARCH_POSTS", {"query": "unpaid"}),
    ("SEARCH_POSTS", {}),
    ("SEARCH_USER", {"query": "jiho"}),
    ("SEARCH_USER", {}),
    ("MUTE", {"target_user_name": "Jiho"}),
    ("MUTE", {}),
    ("SOMETHING_NEW", {}),
]


def _episode_text(action_type, args):
    return AgentActivity(
        platform="reddit",
        agent_id=0,
        agent_name="Haeun",
        action_type=action_type,
        action_args=args,
        round_num=1,
        timestamp="2026-07-22T12:00:00+08:00",
    ).to_episode_text()


@pytest.mark.parametrize("locale", ["en", "es"])
@pytest.mark.parametrize("action_type,args", _EPISODE_CASES)
def test_episode_text_has_no_chinese_for_non_chinese_locales(monkeypatch, locale, action_type, args):
    monkeypatch.setattr(updater_module, "get_locale", lambda: locale)

    text = _episode_text(action_type, args)

    assert not _CJK.search(text), text
    assert text.startswith("[2026-07-22T12:00:00+08:00] [reddit round 1] Haeun: ")


def test_english_episode_text_keeps_what_the_agent_wrote_word_for_word(monkeypatch):
    # The report agent quotes these facts, so the original sentence must survive unchanged inside the quotation marks.
    monkeypatch.setattr(updater_module, "get_locale", lambda: "en")

    post = _episode_text("CREATE_POST", {"content": "Unpaid tasks are unfair"})
    comment = _episode_text(
        "CREATE_COMMENT",
        {"content": "I agree", "post_content": "Unpaid tasks are unfair", "post_author_name": "Jiho"},
    )

    assert post.endswith('Haeun: posted: "Unpaid tasks are unfair"')
    assert comment.endswith('Haeun: commented on Jiho\'s post "Unpaid tasks are unfair": "I agree"')


def test_chinese_locale_keeps_the_original_chinese_episode_text(monkeypatch):
    monkeypatch.setattr(updater_module, "get_locale", lambda: "zh")

    assert _episode_text("CREATE_POST", {"content": "hi"}).endswith("Haeun: 发布了一条帖子：「hi」")
    assert _episode_text("FOLLOW", {"target_user_name": "Jiho"}).endswith("Haeun: 关注了用户「Jiho」")
    assert _episode_text("SOMETHING_NEW", {}).endswith("Haeun: 执行了SOMETHING_NEW操作")
