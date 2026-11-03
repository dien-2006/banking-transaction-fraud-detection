from unittest.mock import Mock
import pytest
from scripts import publish_gold
from data_engineering.gold.release import release_name
from data_engineering.gold.catalog import TABLES


def setup(monkeypatch, *, dq_fail=False, wrong_prefix=False, bad_table=False):
    batch='publication-test'
    prefix='releases/'+release_name(batch)
    manifests={f'runs/{batch}/gold_dq.json':{'gold_prefix':prefix,'metrics':{'failures':['bad'] if dq_fail else []}},f'runs/{batch}/silver_to_gold.json':{'gold_prefix':'wrong' if wrong_prefix else prefix,'metrics':dict.fromkeys(TABLES,10)}}
    state=Mock()
    state.get_json.side_effect=lambda key:manifests.get(key)
    monkeypatch.setattr(publish_gold,'PipelineState',lambda:state)
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
    assert not any('active_release' in sql for sql in calls)
    state.record_stage.assert_not_called()
