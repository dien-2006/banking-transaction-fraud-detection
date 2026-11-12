"use client";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Landmark, Plus } from "lucide-react";
import { FormEvent, useMemo, useState } from "react";
import { bankService } from "@/services/bank.service";
import { useSessionUser } from "@/components/session-context";
import { Modal } from "@/components/ui";
import { dateKey } from "@/lib/presentation";
import { formatCurrency } from "@/lib/presentation";
import { ApiError } from "@/services/api.client";
import { CreationResult } from "./creation-result";
import { AccountCustomerPicker, type AccountCustomer } from "./account-customer-picker";
import "./resource-create-dialog.css";

type Resource =
  "branches" | "customers" | "employees" | "accounts" | "cards" | "loans";
type Field = {
  name: string;
  label: string;
  type?: string;
  required?: boolean;
  maxLength?: number;
  placeholder?: string;
  step?: string;
  min?: number;
  options?: { value: string; label: string; disabled?: boolean }[];
};
const base: Record<Resource, Field[]> = {
  branches: [
    { name: "code", label: "Mã chi nhánh" },
    { name: "name", label: "Tên chi nhánh" },
    { name: "address", label: "Địa chỉ" },
    { name: "city", label: "Thành phố" },
    { name: "phone", label: "Điện thoại" },
    { name: "openDate", label: "Ngày mở", type: "date" },
  ],
  customers: [
    { name: "name", label: "Họ tên", maxLength: 150, placeholder: "Nhập đầy đủ họ và tên" },
    {
      name: "gender",
      label: "Giới tính",
      required: false,
      options: [
        { value: "Male", label: "Nam" },
        { value: "Female", label: "Nữ" },
        { value: "Other", label: "Khác" },
      ],
    },
    { name: "birthDate", label: "Ngày sinh", type: "date", required: false },
    { name: "nationalId", label: "CCCD / Giấy tờ định danh", maxLength: 30, required: false, placeholder: "Nhập số giấy tờ nếu đã có" },
    { name: "phone", label: "Điện thoại", type: "tel", maxLength: 20, required: false, placeholder: "Ví dụ: 0901234567" },
    { name: "email", label: "Email", type: "email", maxLength: 150, required: false, placeholder: "Ví dụ: ten@example.com" },
    { name: "address", label: "Địa chỉ", maxLength: 255, required: false, placeholder: "Số nhà, đường, phường/xã, tỉnh/thành phố" },
    { name: "occupation", label: "Nghề nghiệp", maxLength: 100, required: false, placeholder: "Nhập nghề nghiệp nếu đã biết" },
    { name: "customerType", label: "Loại khách hàng", maxLength: 30, required: false, placeholder: "Nhập loại khách hàng đang sử dụng" },
    { name: "segment", label: "Phân khúc", maxLength: 30, required: false, placeholder: "Nhập phân khúc nếu đã xác định" },
  ],
  employees: [
    { name: "code", label: "Mã nhân viên" },
    { name: "branchId", label: "Chi nhánh", type: "number" },
    { name: "roleId", label: "Vai trò", type: "number" },
    { name: "name", label: "Họ tên" },
    {
      name: "gender",
      label: "Giới tính",
      options: [
        { value: "Male", label: "Nam" },
        { value: "Female", label: "Nữ" },
        { value: "Other", label: "Khác" },
      ],
    },
    { name: "birthDate", label: "Ngày sinh", type: "date" },
    { name: "phone", label: "Điện thoại" },
    { name: "email", label: "Email", type: "email" },
    { name: "hireDate", label: "Ngày vào làm", type: "date" },
    { name: "salary", label: "Lương", type: "number" },
  ],
  accounts: [
    { name: "branchId", label: "Chi nhánh", type: "number" },
    { name: "accountTypeId", label: "Loại tài khoản", type: "number" },
  ],
  cards: [
    { name: "issueDate", label: "Ngày phát hành", type: "date" },
    { name: "expiryDate", label: "Ngày hết hạn", type: "date" },
    { name: "cardType", label: "Loại thẻ", maxLength: 30, placeholder: "Chọn hoặc nhập loại thẻ" },
    { name: "dailyLimit", label: "Hạn mức ngày (VND)", type: "number", min: 0.01, step: "0.01" },
    { name: "pin", label: "PIN ban đầu", type: "password", maxLength: 6, placeholder: "4–6 chữ số" },
    { name: "confirmPin", label: "Xác nhận PIN", type: "password", maxLength: 6, placeholder: "Nhập lại PIN" },
  ],
  loans: [
    { name: "branchId", label: "Chi nhánh", type: "number" },
    { name: "loanTypeId", label: "Sản phẩm vay", type: "number" },
    { name: "principal", label: "Số tiền vay (VND)", type: "number", min: 0.01, step: "0.01" },
    { name: "interestRate", label: "Lãi suất (%/năm)", type: "number", min: 0, step: "0.0001" },
    { name: "termMonths", label: "Kỳ hạn (tháng)", type: "number", min: 1, step: "1" },
    { name: "startDate", label: "Ngày bắt đầu", type: "date" },
  ],
};
const titles: Record<Resource, string> = {
  branches: "chi nhánh",
  customers: "khách hàng",
  employees: "nhân viên",
  accounts: "tài khoản",
  cards: "thẻ",
  loans: "khoản vay",
};
interface ReferenceData {
  branches?: {id:number;name:string}[];
  roles?: {id:number;name:string}[];
  accountTypes?: {id:number;name:string}[];
  cardTypes?: string[];
  loanTypes?: {id:number;name:string;maximumAmount?:number;defaultInterestRate?:number;maximumTermMonths?:number}[];
}

export function ResourceCreateDialog({
  resource,
  onCreated,
}: {
  resource: Resource;
  onCreated: (created: Record<string, unknown>) => void;
}) {
  const user = useSessionUser();
  const queryClient = useQueryClient();
  const enhanced = ["customers", "accounts", "cards", "loans"].includes(resource);
  const today = dateKey(new Date().toISOString());
  const [open, setOpen] = useState(false),
    [error, setError] = useState("");
  const [accountCustomer, setAccountCustomer] = useState<AccountCustomer | null>(null);
  const [loanProductId, setLoanProductId] = useState("");
  const [cardIssueDate, setCardIssueDate] = useState(today);
  const [createdRecord, setCreatedRecord] = useState<Record<string, unknown> | null>(null);
  const [formKey, setFormKey] = useState(0);
  const [errorField, setErrorField] = useState<string | null>(null);
  const errorId = `resource-create-error-${resource}`;
  const refs = useQuery({
    queryKey: ["reference-data", user.role, user.id, user.branchId],
    queryFn: bankService.referenceData,
    enabled: open,
  });
  const reference = refs.data as ReferenceData | undefined;
  const loanProduct = reference?.loanTypes?.find((item) => String(item.id) === loanProductId);
  const cardAccounts = useQuery({
    queryKey: ["creation-card-accounts", user.role, user.id, user.branchId, accountCustomer?.id],
    queryFn: () => bankService.managementCustomerAccounts(accountCustomer!.id),
    enabled: open && resource === "cards" && !!accountCustomer && !createdRecord,
  });
  const fields = useMemo(
    () =>
      base[resource].map((field) => {
        const data = refs.data as ReferenceData | undefined;
        const values =
          field.name === "branchId"
            ? data?.branches
            : field.name === "roleId"
              ? data?.roles
              : field.name === "accountTypeId"
                ? data?.accountTypes
                : field.name === "loanTypeId"
                  ? data?.loanTypes
                  : undefined;
        return values
          ? {
              ...field,
              options: values.map((value) => ({
                  value: String(value.id),
                  label: value.name,
                  disabled: field.name === "branchId" && user.role === "employee"
                    && Number(value.id) !== user.branchId,
                })),
            }
          : field;
      }),
    [resource, refs.data, user.role, user.branchId],
  );
  const mutation = useMutation({
    mutationFn: async (body: Record<string, unknown>) => {
      const result = await bankService.managementCreate(resource, body);
      const identity: Record<string, [string,string]> = { customers:["customerid","customercode"], accounts:["accountid","accountnumber"], cards:["cardid","maskedcardnumber"], loans:["loanid","loancode"] };
      const contract = identity[resource];
      if (contract && (!result || !Number.isSafeInteger(Number(result[contract[0]])) || Number(result[contract[0]])<=0 || !result[contract[1]])) {
        throw new ApiError("Chưa nhận được kết quả lưu hợp lệ.",200,"UNKNOWN_RESULT");
      }
      return result;
    },
    onSuccess: (created) => {
      if (enhanced) setCreatedRecord(created); else setOpen(false);
      setError("");
      onCreated(created);
      if (resource === "accounts") {
        void queryClient.invalidateQueries({ queryKey: ["staff-customers", user.role, user.id, user.branchId] });
        void queryClient.invalidateQueries({ queryKey: ["account-owner-options", user.role, user.id, user.branchId] });
      }
    },
    onError: (caught) => {
      if (!enhanced) {
        setError(caught.message);
        return;
      }
      setErrorField(caught instanceof ApiError ? caught.field ?? null : null);
      if (!(caught instanceof ApiError) || caught.status >= 500 || caught.status < 400) {
        setError("Chưa xác định được kết quả lưu do lỗi kết nối hoặc dịch vụ. Vui lòng kiểm tra danh sách trước khi thử lại để tránh tạo trùng.");
      } else if (caught.status === 401) {
        setError("Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại.");
      } else if (caught.status === 403) {
        setError(caught.message && /[À-ỹ]/.test(caught.message) ? caught.message : "Bạn không có quyền thực hiện thao tác với hồ sơ hoặc tài khoản này.");
      } else {
        setError(caught.code === "INTEGRITY" ? "Thông tin bị trùng hoặc không còn hợp lệ. Vui lòng kiểm tra lại dữ liệu." : caught.message);
      }
      if (caught instanceof ApiError && caught.field === "customerId") {
        setAccountCustomer(null);
        void queryClient.invalidateQueries({ queryKey: ["account-owner-options", user.role, user.id, user.branchId] });
      }
      if (caught instanceof ApiError && ["branchId", "accountTypeId"].includes(caught.field ?? "")) void refs.refetch();
    },
  });
  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    event.stopPropagation();
    if (mutation.isPending || !refs.isSuccess) return;
    setError("");
    const form = new FormData(event.currentTarget),
      body: Record<string, unknown> = {};
    for (const field of fields) {
      const value = String(form.get(field.name) ?? "").trim();
      if (value !== "")
        body[field.name] =
          field.type === "number" &&
          [
            "branchId",
            "roleId",
            "accountTypeId",
            "customerId",
            "accountId",
            "loanTypeId",
            "termMonths",
          ].includes(field.name)
            ? Number(value)
            : value;
    }
    if (resource === "accounts") {
      if (!accountCustomer) {
        setError("Vui lòng chọn khách hàng đã có hồ sơ trong hệ thống.");
        setErrorField("customerId");
        event.currentTarget.querySelector<HTMLInputElement>("#account-owner-search")?.focus();
        return;
      }
      body.customerId = accountCustomer.id;
      body.category = "CUSTOMER";
    }
    if (resource === "cards" || resource === "loans") {
      if (!accountCustomer) {
        setError("Vui lòng chọn khách hàng đã có hồ sơ và ID trong hệ thống."); setErrorField("customerId"); return;
      }
      body.customerId = accountCustomer.id;
    }
    if (resource === "cards") {
      const accountId = Number(form.get("accountId"));
      if (!cardAccounts.data?.some((item) => Number(item.accountid) === accountId)) {
        setError("Vui lòng chọn tài khoản đang hoạt động thuộc khách hàng này."); setErrorField("accountId"); return;
      }
      body.accountId = accountId;
      if (!/^[0-9]{4,6}$/.test(String(body.pin ?? ""))) {
        setError("PIN phải gồm 4 đến 6 chữ số."); setErrorField("pin"); return;
      }
      if (body.pin !== body.confirmPin) {
        setError("PIN xác nhận không khớp."); setErrorField("confirmPin"); return;
      }
      delete body.confirmPin;
      if (String(body.expiryDate ?? "") <= String(body.issueDate || today)) {
        setError("Ngày hết hạn phải sau ngày phát hành."); setErrorField("expiryDate"); return;
      }
    }
    const amountField = resource === "cards" ? "dailyLimit" : resource === "loans" ? "principal" : null;
    if (amountField) {
      const value = String(body[amountField] ?? "");
      if (!/^\d{1,17}(?:\.\d{1,2})?$/.test(value) || BigInt(value.replace(".", "")) <= 0n) {
        setError("Số tiền phải lớn hơn 0 và có tối đa 2 chữ số thập phân."); setErrorField(amountField); return;
      }
    }
    if (resource === "customers" && !body.name) {
      setError("Vui lòng nhập họ tên khách hàng.");
      setErrorField("name");
      return;
    }
    if (resource === "customers" && body.phone && !/^\+?[0-9][0-9 ().-]{5,19}$/.test(String(body.phone))) {
      setError("Số điện thoại không đúng định dạng. Ví dụ: 0901234567 hoặc +84 901 234 567.");
      setErrorField("phone");
      return;
    }
    mutation.mutate(body);
  };
  const begin = () => {
    setError(""); setErrorField(null); mutation.reset(); setCreatedRecord(null);
    setAccountCustomer(null); setLoanProductId(""); setCardIssueDate(today);
    setFormKey((value) => value + 1); setOpen(true);
  };
  const renderField = (field: Field) => (
            <label className={`resource-create-label text-sm font-bold ${resource === "customers" && field.name === "address" ? "sm:col-span-2" : ""}`} key={field.name === "interestRate" ? `${field.name}-${loanProductId}` : field.name}>
              <span>{field.label}{enhanced && field.required !== false && <span className="customer-field-required" aria-hidden="true"> *</span>}</span>
              {field.options ? (
                <select
                  className="field mt-1"
                  name={field.name}
                  aria-label={field.label}
                  disabled={mutation.isPending}
                  required={field.required !== false}
                  aria-invalid={!!error && errorField === field.name || undefined}
                  aria-describedby={error && errorField === field.name ? errorId : undefined}
                  {...(field.name === "loanTypeId" ? {
                    value: loanProductId,
                    onChange: (event: React.ChangeEvent<HTMLSelectElement>) => { setLoanProductId(event.target.value); setError(""); },
                  } : {
                    defaultValue: ["accounts", "loans"].includes(resource) && field.name === "branchId" && user.role === "employee"
                      ? String(user.branchId) : undefined,
                    onChange: () => { if (enhanced) setError(""); },
                  })}
                >
                  <option value="">{resource === "customers" && field.required === false ? "Chưa cung cấp" : `Chọn ${field.label.toLowerCase()}`}</option>
                  {field.options.map((option) => (
                    <option value={option.value} key={option.value} disabled={option.disabled}>
                      {option.label}{option.disabled ? " — Ngoài phạm vi phụ trách" : ""}
                    </option>
                  ))}
                </select>
              ) : (
                <input
                  className="field mt-1"
                  name={field.name}
                  aria-label={field.label}
                  disabled={mutation.isPending}
                  type={field.type ?? "text"}
                  required={field.required !== false}
                  aria-invalid={!!error && errorField === field.name || undefined}
                  aria-describedby={error && errorField === field.name ? errorId : undefined}
                  maxLength={field.maxLength}
                  placeholder={field.placeholder}
                  defaultValue={field.name === "issueDate" || field.name === "startDate" ? today : field.name === "interestRate" ? loanProduct?.defaultInterestRate : undefined}
                  onChange={(event) => { if (enhanced) setError(""); if (field.name === "issueDate") setCardIssueDate(event.target.value || today); }}
                  max={resource === "customers" && field.name === "birthDate" ? today : field.name === "principal" ? loanProduct?.maximumAmount : field.name === "termMonths" ? loanProduct?.maximumTermMonths : undefined}
                  min={field.min ?? (field.name === "expiryDate" ? cardIssueDate : undefined)}
                  step={field.step ?? (field.type === "number" ? "any" : undefined)}
                  inputMode={field.name.toLowerCase().includes("pin") ? "numeric" : undefined}
                  autoComplete={field.type === "password" ? "new-password" : undefined}
                  list={field.name === "cardType" ? "creation-card-types" : undefined}
                />
              )}
              {field.name === "branchId" && user.role === "employee" && (
                <span className="mt-1 block text-xs font-normal text-slate-500">
                  Bạn chỉ được chọn chi nhánh phụ trách.
                </span>
              )}
              {field.name === "cardType" && <datalist id="creation-card-types">{reference?.cardTypes?.map((type) => <option key={type} value={type} />)}</datalist>}
            </label>
  );
  return (
    <>
      <button
        type="button"
        className="btn-primary h-9"
        onClick={begin}
      >
        <Plus size={15} />
        {resource === "accounts" ? "Mở tài khoản" : resource === "cards" ? "Phát hành thẻ" : resource === "loans" ? "Tạo hồ sơ vay" : `Thêm ${titles[resource]}`}
      </button>
      <Modal
        open={open}
        onOpenChange={(value) => !mutation.isPending && setOpen(value)}
        title={resource === "accounts" ? "Mở tài khoản" : resource === "cards" ? "Phát hành thẻ" : resource === "loans" ? "Tạo hồ sơ vay" : `Thêm ${titles[resource]}`}
        className={enhanced ? `customer-create-dialog${resource === "accounts" ? " account-opening-dialog" : ""}` : ""}
        description={resource === "customers"
          ? "Tạo hồ sơ khách hàng mới. Mã khách hàng được tự động cấp sau khi lưu."
          : resource === "accounts" ? "Mở tài khoản ngân hàng cho khách hàng đã có hồ sơ."
          : resource === "cards" ? "Chọn khách hàng đã có ID và tài khoản hợp lệ. Hệ thống tự cấp số thẻ; kết quả chỉ hiển thị số đã che."
          : resource === "loans" ? "Chọn khách hàng đã có ID và sản phẩm vay. Hệ thống tự cấp mã hồ sơ; hồ sơ mới cần được phê duyệt."
          : "Dữ liệu sẽ được kiểm tra bởi API nghiệp vụ."}
      >
        {createdRecord && enhanced ? <CreationResult resource={resource} record={createdRecord} onClose={() => setOpen(false)} onAnother={begin} /> :
        <form key={formKey} className={`resource-create-form ${enhanced ? "customer-create-form" : ""}${resource === "accounts" ? " account-opening-form" : ""}`} onSubmit={submit}
          onInvalidCapture={(event) => {
            if (!enhanced) return;
            event.preventDefault();
            const input = event.target as HTMLInputElement | HTMLSelectElement;
            if (input.form?.querySelector(":invalid") !== input) return;
            const field = fields.find((entry) => entry.name === input.name);
            if (!field) return;
            const label = field.label.toLocaleLowerCase("vi");
            const message = input.validity.valueMissing ? `Vui lòng ${field.options ? "chọn" : "nhập"} ${label}.`
              : field.name === "email" ? "Email không đúng định dạng. Ví dụ: ten@example.com."
              : field.name === "birthDate" ? "Ngày sinh phải hợp lệ và không được ở tương lai."
              : `Thông tin ${label} không hợp lệ. Vui lòng kiểm tra lại.`;
            setError(message);
            setErrorField(field.name);
            input.focus();
          }}>
          <div className="resource-create-fields grid gap-4 sm:grid-cols-2">
          {enhanced && resource !== "accounts" && <p className="resource-create-guidance sm:col-span-2"><span aria-hidden="true">*</span> Trường bắt buộc.{resource === "customers" ? " Các ô còn lại có thể để trống." : ""}</p>}
          {resource === "accounts" && <>
            <div className="account-opening-owner">
              <AccountCustomerPicker selected={accountCustomer} showId={false}
                invalid={!!error && errorField === "customerId"}
                describedBy={error && errorField === "customerId" ? errorId : undefined}
                onSelect={(customer) => { setAccountCustomer(customer); setError(""); setErrorField(null); }} disabled={mutation.isPending} />
              {!accountCustomer && <p className="account-opening-help">Tạo hồ sơ ở mục Khách hàng trước nếu chưa có.</p>}
            </div>
            <fieldset className="account-opening-details">
              <legend>Thông tin tài khoản</legend>
              <div className="account-opening-detail-fields">{fields.map(renderField)}</div>
            </fieldset>
            <p className="account-opening-note"><Landmark size={17} aria-hidden="true" />Số tài khoản sẽ được cấp sau khi mở thành công.</p>
          </>}
          {(resource === "cards" || resource === "loans") && <AccountCustomerPicker label={resource === "loans" ? "Khách hàng vay" : "Chủ thẻ"} selected={accountCustomer} onSelect={(customer) => {setAccountCustomer(customer);setError("");}} disabled={mutation.isPending} />}
          {resource === "cards" && <label className="resource-create-label text-sm font-bold sm:col-span-2" key={`card-account-${accountCustomer?.id ?? "none"}`}>
            <span>Tài khoản liên kết <span className="customer-field-required">*</span></span>
            <select name="accountId" aria-label="Tài khoản liên kết" className="field" required disabled={mutation.isPending || !cardAccounts.isSuccess || !accountCustomer} onChange={() => setError("")}>
              <option value="">{!accountCustomer ? "Chọn chủ thẻ trước" : cardAccounts.isFetching ? "Đang tải tài khoản…" : "Chọn tài khoản của khách hàng"}</option>
              {cardAccounts.data?.map((account) => <option key={account.accountid} value={account.accountid}>{account.accountnumber} · {account.accounttypename} · {account.branchname}</option>)}
            </select>
            {cardAccounts.isError && <small className="text-red-600">Không thể tải tài khoản. <button type="button" onClick={() => void cardAccounts.refetch()}>Thử lại</button></small>}
            {accountCustomer && cardAccounts.isSuccess && !cardAccounts.data.length && <small>Khách hàng chưa có tài khoản đang hoạt động trong phạm vi của bạn. Hãy mở tài khoản trước khi phát hành thẻ.</small>}
          </label>}
          {resource !== "accounts" && fields.filter((field) => resource !== "customers" || !["occupation", "customerType", "segment"].includes(field.name)).map(renderField)}
          {resource === "customers" && <details className="customer-extra-fields sm:col-span-2">
            <summary>Thông tin bổ sung <span>Nghề nghiệp, loại khách hàng, phân khúc</span></summary>
            <div className="grid gap-3 sm:grid-cols-2">
              {fields.filter((field) => ["occupation", "customerType", "segment"].includes(field.name)).map(renderField)}
            </div>
          </details>}
          {resource === "loans" && loanProduct && <p className="creation-product-note sm:col-span-2">Sản phẩm: {loanProduct.name} · Tối đa {loanProduct.maximumAmount == null ? "Chưa cập nhật" : formatCurrency(loanProduct.maximumAmount,"VND")} · Kỳ hạn tối đa {loanProduct.maximumTermMonths ?? "Chưa cập nhật"} tháng · Lãi suất tham khảo {loanProduct.defaultInterestRate ?? "Chưa cập nhật"}%/năm.</p>}
          {resource === "cards" && <p className="creation-product-note sm:col-span-2">PIN gồm 4–6 chữ số. Không hiển thị lại sau khi phát hành thẻ.</p>}
          {refs.isError && (
            <p className="text-sm text-red-600 sm:col-span-2" role="alert">
              Không thể tải danh mục tham chiếu: {refs.error.message}
              <button
                type="button"
                className="ml-2 underline"
                onClick={() => void refs.refetch()}
              >
                Thử lại
              </button>
            </p>
          )}
          </div>
          {error && <p id={errorId} className="resource-create-error" role="alert">{error}</p>}
          <footer className="flex justify-end gap-2 border-t pt-4 sm:col-span-2">
            <button
              type="button"
              className="btn-secondary"
              disabled={mutation.isPending}
              onClick={() => setOpen(false)}
            >
              Hủy
            </button>
            <button
              className="btn-primary"
              disabled={mutation.isPending || !refs.isSuccess}
            >
              {mutation.isPending ? "Đang lưu..." : resource === "customers" ? "Tạo khách hàng" : resource === "accounts" ? "Mở tài khoản" : resource === "cards" ? "Phát hành thẻ" : resource === "loans" ? "Tạo hồ sơ vay" : "Lưu dữ liệu"}
            </button>
          </footer>
        </form>}
      </Modal>
    </>
  );
}
