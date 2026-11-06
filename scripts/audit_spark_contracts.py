"""Real Spark regressions for the Gold business day and financial DQ.

Execute with spark-submit; uses configured service credentials but writes no datasets.
"""
import os
from pathlib import Path
from dotenv import load_dotenv
load_dotenv(Path(__file__).resolve().parents[1] / '.env')
os.environ['MINIO_ACCESS_KEY']=os.environ.get('MINIO_ACCESS_KEY') or os.environ['MINIO_ROOT_USER']
os.environ['MINIO_SECRET_KEY']=os.environ.get('MINIO_SECRET_KEY') or os.environ['MINIO_ROOT_PASSWORD']
from data_engineering.common.spark import session
from data_engineering.gold.build import _date_key,_time_key
from data_engineering.quality.quarantine import _transaction_violations
from pyspark.sql import functions as F
s=session('batch-stream-contract-check')
try:
 row=s.createDataFrame([('2026-11-01 17:30:00',)],['at']).select(F.col('at').cast('timestamp').alias('at')).select(_date_key('at').alias('day'),_time_key('at').alias('time')).first()
 assert (row.day,row.time)==(20261102,30),row
 tx=s.createDataFrame([(1,'Success',1000.,1,None),(2,'Success',1000.,1,None),(3,'Success',1000.,2,1)],'transaction_id long,status string,amount double,transaction_type_id int,original_transaction_id long')
 frames={'bank_transaction':tx,
 'transaction_posting':s.createDataFrame([(1,'DEBIT',1000.),(1,'CREDIT',1000.),(2,'DEBIT',10.),(2,'CREDIT',10.),(3,'DEBIT',1000.),(3,'CREDIT',1000.)],'transaction_id long,posting_type string,amount double'),
 'transaction_type':s.createDataFrame([(1,'TRANSFER'),(2,'REVERSAL')],'transaction_type_id int,type_code string'),
 'risk_assessment':s.createDataFrame([(1,'ALLOW',1,'2026-11-01'),(2,'ALLOW',2,'2026-11-01')],'transaction_id long,decision string,risk_assessment_id long,assessed_at string'),
 'review_case':s.createDataFrame([], 'transaction_id long,status string'),
 'event_outbox':s.createDataFrame([('1','TransactionCompleted','BANK_TRANSACTION'),('2','TransactionCompleted','BANK_TRANSACTION'),('3','TransactionCompleted','BANK_TRANSACTION')], 'aggregate_id string,event_type string,aggregate_type string')}
 rows=_transaction_violations(frames).collect()
 assert len(rows)==1 and rows[0].transaction_id==2,rows
 print('PASS Vietnam midnight grouping, exact posting amount, legitimate reversal gate',flush=True)
finally: s.stop()
