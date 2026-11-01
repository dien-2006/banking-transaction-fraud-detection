"use client";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Plus } from "lucide-react";
import { FormEvent, useMemo, useState } from "react";
import { bankService } from "@/services/bank.service";
import { useSessionUser } from "@/components/session-context";
import { Modal } from "@/components/ui";

type Resource =
  "branches" | "customers" | "employees" | "accounts" | "cards" | "loans";
type Field = {
  name: string;
  label: string;
  type?: string;
  required?: boolean;
  options?: { value: string; label: string }[];
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
    { name: "code", label: "Mã khách hàng" },
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
    { name: "nationalId", label: "CCCD" },
    { name: "phone", label: "Điện thoại" },
    { name: "email", label: "Email", type: "email" },
    { name: "address", label: "Địa chỉ" },
    { name: "occupation", label: "Nghề nghiệp" },
    { name: "customerType", label: "Loại khách hàng" },
    { name: "segment", label: "Phân khúc" },
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
    { name: "accountNumber", label: "Số tài khoản" },
    { name: "branchId", label: "Chi nhánh", type: "number" },
    { name: "accountTypeId", label: "Loại tài khoản", type: "number" },
    {
      name: "customerId",
      label: "ID khách hàng (bỏ trống với tài khoản nội bộ)",
      type: "number",
      required: false,
    },
    {
      name: "category",
      label: "Nhóm tài khoản",
      options: [
        { value: "CUSTOMER", label: "Khách hàng" },
        { value: "INTERNAL", label: "Nội bộ" },
      ],
    },
  ],
  cards: [
    { name: "cardNumber", label: "Số thẻ" },
    { name: "accountId", label: "ID tài khoản", type: "number" },
    { name: "customerId", label: "ID khách hàng", type: "number" },
    { name: "issueDate", label: "Ngày phát hành", type: "date" },
    { name: "expiryDate", label: "Ngày hết hạn", type: "date" },
    { name: "cardType", label: "Loại thẻ" },
    { name: "pin", label: "PIN ban đầu", type: "password" },
    { name: "dailyLimit", label: "Hạn mức ngày", type: "number" },
  ],
  loans: [
    { name: "code", label: "Mã khoản vay" },
    { name: "customerId", label: "ID khách hàng", type: "number" },
    { name: "branchId", label: "Chi nhánh", type: "number" },
    { name: "loanTypeId", label: "Sản phẩm vay", type: "number" },
    { name: "principal", label: "Số tiền vay", type: "number" },
    { name: "interestRate", label: "Lãi suất (%)", type: "number" },
    { name: "termMonths", label: "Kỳ hạn (tháng)", type: "number" },
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

export function ResourceCreateDialog({
  resource,
  onCreated,
}: {
  resource: Resource;
  onCreated: () => void;
}) {
  const user = useSessionUser();
  const [open, setOpen] = useState(false),
    [error, setError] = useState("");
  const refs = useQuery({
    queryKey: ["reference-data", user.role, user.id, user.branchId],
    queryFn: bankService.referenceData,
    enabled: open,
  });
  const fields = useMemo(
    () =>
      base[resource].map((field) => {
        const data = refs.data as
          | {
              branches?: { id: number; name: string }[];
              roles?: { id: number; name: string }[];
              accountTypes?: { id: number; name: string }[];
              loanTypes?: { id: number; name: string }[];
            }
          | undefined;
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
              options: values
                .filter(
                  (value) =>
                    field.name !== "branchId" ||
                    user.role !== "employee" ||
                    Number(value.id) === user.branchId,
                )
                .map((value) => ({
                  value: String(value.id),
                  label: value.name,
                })),
            }
          : field;
      }),
    [resource, refs.data, user.role, user.branchId],
  );
  const mutation = useMutation({
    mutationFn: (body: Record<string, unknown>) =>
      bankService.managementCreate(resource, body),
    onSuccess: () => {
      setOpen(false);
      setError("");
      onCreated();
    },
    onError: (caught) => setError(caught.message),
  });
  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
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
    mutation.mutate(body);
  };
  return (
    <>
      <button
        className="btn-primary h-9"
        onClick={() => {
          setError("");
          mutation.reset();
          setOpen(true);
        }}
      >
        <Plus size={15} />
        Thêm {titles[resource]}
      </button>
      <Modal
        open={open}
        onOpenChange={(value) => !mutation.isPending && setOpen(value)}
        title={`Thêm ${titles[resource]}`}
        description="Dữ liệu sẽ được kiểm tra bởi API nghiệp vụ."
      >
        <form className="grid gap-4 sm:grid-cols-2" onSubmit={submit}>
          {fields.map((field) => (
            <label className="text-sm font-bold" key={field.name}>
              {field.label}
              {field.options ? (
                <select
                  className="field mt-1"
                  name={field.name}
                  aria-label={field.label}
                  disabled={mutation.isPending}
                  required={field.required !== false}
                >
                  <option value="">Chọn {field.label.toLowerCase()}</option>
                  {field.options.map((option) => (
                    <option value={option.value} key={option.value}>
                      {option.label}
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
                  step={field.type === "number" ? "any" : undefined}
                />
              )}
            </label>
          ))}
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
          {error && (
            <p className="text-sm text-red-600 sm:col-span-2" role="alert">
              {error}
            </p>
          )}
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
              {mutation.isPending ? "Đang lưu..." : "Lưu dữ liệu"}
            </button>
          </footer>
        </form>
      </Modal>
    </>
  );
}
