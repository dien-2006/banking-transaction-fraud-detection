export type EmployeeRow = { code:string; name:string; branch:string; position:string; phone:string; email:string; status:"Đang làm việc"|"Tạm nghỉ"; avatar:string };

export const employeeRows: EmployeeRow[] = [
  {code:"NV001",name:"Nguyễn Minh Anh",branch:"Hội sở",position:"Giám đốc vận hành",phone:"0901 234 567",email:"minhanh@d4bank.vn",status:"Đang làm việc",avatar:"/branches/head-office.png"},
  {code:"NV002",name:"Trần Quốc Huy",branch:"Chi nhánh TP.HCM",position:"Trưởng phòng khách hàng",phone:"0902 345 678",email:"quochuy@d4bank.vn",status:"Đang làm việc",avatar:"/branches/hcm.png"},
  {code:"NV003",name:"Lê Thu Hà",branch:"Chi nhánh Đà Nẵng",position:"Chuyên viên tín dụng",phone:"0903 456 789",email:"thuha@d4bank.vn",status:"Đang làm việc",avatar:"/branches/danang.png"},
  {code:"NV004",name:"Phạm Đức Long",branch:"Chi nhánh Cần Thơ",position:"Giao dịch viên",phone:"0904 567 890",email:"duclong@d4bank.vn",status:"Đang làm việc",avatar:"/branches/cantho.png"},
  {code:"NV005",name:"Vũ Ngọc Lan",branch:"Chi nhánh Hải Phòng",position:"Chuyên viên kiểm soát",phone:"0905 678 901",email:"ngoclan@d4bank.vn",status:"Tạm nghỉ",avatar:"/branches/haiphong.png"},
];
