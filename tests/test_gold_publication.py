from unittest.mock import Mock
import pytest
from scripts import publish_gold
from data_engineering.gold.release import release_name
from data_engineering.gold.catalog import TABLES
from contextlib import nullcontext


def setup(monkeypatch, *, dq_fail=False, wrong_prefix=False, bad_table=False):
    batch='publication-test'
    prefix='releases/'+release_name(batch)
    manifests={f'runs/{batch}/gold_dq.json':{'gold_prefix':prefix,'metrics':{'failures':['bad'] if dq_fail else []}},f'runs/{batch}/silver_to_gold.json':{'gold_prefix':'wrong' if wrong_prefix else prefix,'metrics':dict.fromkeys(TABLES,10)}}
    manifests[f'runs/{batch}/postgres_to_bronze.json']={'recorded_at':'2026-11-04T00:00:00+00:00'}
    state=Mock()
    state.get_json.side_effect=lambda key:manifests.get(key)
    monkeypatch.setattr(publish_gold,'PipelineState',lambda:state)
    monkeypatch.setattr(publish_gold,'publication_lock',nullcontext)
    calls=[]
    def execute(sql):
        calls.append(sql)
        if sql.startswith('SELECT count(*)'):return [[9 if bad_table else 10]]
        return []
    monkeypatch.setattr(publish_gold,'execute',execute)
    monkeypatch.setattr(publish_gold,'register_catalog',Mock())
    return batch,calls,state


def test_pointer_changes_only_after_all_datasets_and_dashboard_dependencies_pass(monkeypatch):
    batch,calls,state=setup(monkeypatch)
    result=publish_gold.publish(batch)
    assert result['schema']==release_name(batch)
    assert calls[-1].startswith('CREATE OR REPLACE VIEW hive.gold.active_release')
    assert sum(sql.startswith('SELECT count(*)') for sql in calls)==17
    assert sum('.vw_' in sql for sql in calls)==6
    state.record_stage.assert_called_once()


@pytest.mark.parametrize('options',[{'dq_fail':True},{'wrong_prefix':True},{'bad_table':True}])
def test_failed_candidate_never_replaces_active_release(monkeypatch,options):
    batch,calls,state=setup(monkeypatch,**options)
    with pytest.raises(ValueError):publish_gold.publish(batch)
    assert not any(sql.startswith('CREATE OR REPLACE VIEW hive.gold.active_release') for sql in calls)
    state.record_stage.assert_not_called()


def test_retry_of_old_batch_cannot_regress_active_gold(monkeypatch):
    batch,calls,state=setup(monkeypatch)
    original=state.get_json.side_effect
    state.get_json.side_effect=lambda key: {'source_recorded_at':'2026-11-05T00:00:00+00:00'} if key=='gold/active_release.json' else original(key)
    with pytest.raises(ValueError,match='newer Gold'):
        publish_gold.publish(batch)
    assert not any(sql.startswith('CREATE OR REPLACE VIEW') for sql in calls)
