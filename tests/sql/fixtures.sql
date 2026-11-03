-- Fixtures are forbidden on the user's banking database.
DO $$ BEGIN
    IF current_database() !~ '^d4_' THEN RAISE EXCEPTION 'isolated d4_* database required'; END IF;
END $$;
SET search_path=banking,public;
INSERT INTO role(rolename) VALUES('Test admin') ON CONFLICT(rolename) DO NOTHING;
INSERT INTO employee(employeecode,branchid,roleid,fullname,phone,email,hiredate,salary)
SELECT 'TEST-ADMIN',b.branchid,r.roleid,'Test Admin','test-phone','staff@example.invalid',CURRENT_DATE,0
FROM branch b,role r WHERE b.branchcode='DEMO-HCM' AND r.rolename='Test admin'
ON CONFLICT(employeecode) DO NOTHING;
INSERT INTO "system_user"(employeeid,username,passwordhash)
SELECT employeeid,'test-admin',public.crypt('test-only-password',public.gen_salt('bf',4))
FROM employee WHERE employeecode='TEST-ADMIN' ON CONFLICT(username) DO NOTHING;
INSERT INTO customer(customercode,fullname) VALUES('TEST-OTHER','Test Other') ON CONFLICT(customercode) DO NOTHING;
INSERT INTO bank_account(accountnumber,branchid,accounttypeid,opendate,balance,accountcategory)
SELECT 'TEST-INTERNAL',b.branchid,a.accounttypeid,CURRENT_DATE,100000000,'INTERNAL'
FROM branch b,account_type a WHERE b.branchcode='DEMO-HCM' AND a.typename='Demo Current'
ON CONFLICT(accountnumber) DO NOTHING;
INSERT INTO loan_type(loantypename,maxamount,defaultinterestrate,maxtermmonths)
VALUES('Test loan',100000000,0,12) ON CONFLICT(loantypename) DO NOTHING;
UPDATE bank_account SET balance=100000000 WHERE accountnumber IN ('DEMO-0001','DEMO-0002');
