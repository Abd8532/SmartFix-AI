export const INITIAL_TICKETS = [];

export const MOCK_USERS = {};

export const CATEGORIES = [
  { id: "Electrical", label: "Electrical" },
  { id: "Plumbing", label: "Plumbing" },
  { id: "Lift", label: "Lift" },
  { id: "HVAC", label: "HVAC" },
  { id: "Other", label: "Other" },
];

export const PRIORITIES = [
  { id: "Routine", label: "Routine", badge: "bg-[#047857] text-white font-medium" },
  { id: "Urgent", label: "Urgent", badge: "bg-[#b45309] text-white font-medium" },
  { id: "Emergency", label: "Emergency", badge: "bg-[#b91c1c] text-white font-medium" },
];

export const STATUS_CONFIG = {
  Open: {
    label: "Assigned",
    pill: "bg-[#E7EDFF] text-[#2D60FF] border border-[#2D60FF]/20",
    dot: "bg-[#2D60FF]"
  },
  Assigned: {
    label: "Assigned",
    pill: "bg-[#E7EDFF] text-[#2D60FF] border border-[#2D60FF]/20",
    dot: "bg-[#2D60FF]"
  },
  "In Progress": {
    label: "In Progress",
    pill: "bg-[#FFF5D9] text-[#FFBB38] border border-[#FFBB38]/20",
    dot: "bg-[#FFBB38]"
  },
  "Pending User Verification": {
    label: "Pending User Verification",
    pill: "bg-[#FFF5D9] text-[#FFBB38] border border-[#FFBB38]/20",
    dot: "bg-[#FFBB38]"
  },
  "Awaiting Tech Sign-off": {
    label: "Awaiting Tech Sign-off",
    pill: "bg-[#FFF5D9] text-[#FFBB38] border border-[#FFBB38]/20",
    dot: "bg-[#FFBB38]"
  },
  Done: {
    label: "Completed",
    pill: "bg-[#DCFAF8] text-[#16DBCC] border border-[#16DBCC]/20",
    dot: "bg-[#16DBCC]"
  },
  Completed: {
    label: "Completed",
    pill: "bg-[#DCFAF8] text-[#16DBCC] border border-[#16DBCC]/20",
    dot: "bg-[#16DBCC]"
  }
};
