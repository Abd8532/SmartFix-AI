export const INITIAL_TICKETS = [
  {
    id: "DEMO-5002",
    title: "High pressure water pipe leaking under restroom sink",
    description: "Main cold water supply flex pipe has a high-velocity pinhole spray beneath the industrial sink. Puddle expanding rapidly towards electric hand-dryer circuit.",
    category: "Plumbing",
    priority: "Urgent", // 'Emergency' | 'Urgent' | 'Routine'
    status: "Assigned", // 'Assigned' | 'In Progress' | 'Pending User Verification' | 'Completed'
    techConfirmed: false,
    userConfirmed: false,
    location: "Demo Building B · Men's Restroom",
    assignedTo: "Plumbing Tech",
    isHazard: true,
    isDemo: true,
    reportedBy: {
      id: "usr_1",
      name: "Alex Rivera",
      role: "User",
      avatar: "https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=120&auto=format&fit=crop&q=80"
    },
    reporterId: "usr_1",
    photo: "https://images.unsplash.com/photo-1585704032915-c3400ca199e7?w=800&auto=format&fit=crop&q=80",
    createdAt: new Date(Date.now() - 35 * 60 * 1000).toISOString(),
    updatedAt: new Date(Date.now() - 35 * 60 * 1000).toISOString(),
    resolutionNotes: null,
    resolvedAt: null
  },
  {
    id: "REQ-10240",
    title: "Sub-panel electrical breaker tripping repeatedly",
    description: "Sub-panel 4B tripped twice this morning after starting ventilation fan. Breaker housing warm to touch. Safety hazard tag placed.",
    category: "Electrical",
    priority: "Emergency",
    status: "Pending User Verification",
    techConfirmed: true,
    userConfirmed: false,
    location: "Keller Science Center · Server Room",
    assignedTo: "Electrical Tech",
    isHazard: true,
    isDemo: false,
    reportedBy: {
      id: "usr_1",
      name: "Alex Rivera",
      role: "User",
      avatar: "https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=120&auto=format&fit=crop&q=80"
    },
    reporterId: "usr_1",
    photo: "https://images.unsplash.com/photo-1544716278-ca5e3f4abd8c?w=800&auto=format&fit=crop&q=80",
    createdAt: new Date(Date.now() - 3 * 3600 * 1000).toISOString(),
    updatedAt: new Date(Date.now() - 25 * 60 * 1000).toISOString(),
    resolutionNotes: "Marcus Vance inspected panel and replaced faulty 20A circuit breaker. Ready for user confirmation.",
    resolvedAt: null
  },
  {
    id: "DEMO-5003",
    title: "Elevator A door motor stuttering and misaligned",
    description: "Door safety sensor failing periodically on ground floor entrance. Cabin leveling requires inspection.",
    category: "Lift",
    priority: "Emergency",
    status: "In Progress",
    techConfirmed: false,
    userConfirmed: false,
    location: "Demo Building C · Elevator A",
    assignedTo: "General Maintenance",
    isHazard: false,
    isDemo: true,
    reportedBy: {
      id: "usr_2",
      name: "Samantha Wu",
      role: "User",
      avatar: "https://images.unsplash.com/photo-1580489944761-15a19d654956?w=120&auto=format&fit=crop&q=80"
    },
    reporterId: "usr_2",
    photo: "https://images.unsplash.com/photo-1581092160607-ee22621dd758?w=800&auto=format&fit=crop&q=80",
    createdAt: new Date(Date.now() - 5 * 3600 * 1000).toISOString(),
    updatedAt: new Date(Date.now() - 5 * 3600 * 1000).toISOString(),
    resolutionNotes: null,
    resolvedAt: null
  },
  {
    id: "REQ-10237",
    title: "HVAC rooftop unit vibrating loudly above study hall",
    description: "Vibration dampeners worn out on north rooftop condenser unit. Air temperature elevated in zone 3.",
    category: "HVAC",
    priority: "Routine",
    status: "Completed",
    techConfirmed: true,
    userConfirmed: true,
    location: "Carrow Library · Study Hall",
    assignedTo: "General Maintenance",
    isHazard: false,
    isDemo: false,
    reportedBy: {
      id: "usr_1",
      name: "Alex Rivera",
      role: "User",
      avatar: "https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=120&auto=format&fit=crop&q=80"
    },
    reporterId: "usr_1",
    photo: "https://images.unsplash.com/photo-1504307651254-35680f356dfd?w=800&auto=format&fit=crop&q=80",
    createdAt: new Date(Date.now() - 9 * 3600 * 1000).toISOString(),
    updatedAt: new Date(Date.now() - 2 * 3600 * 1000).toISOString(),
    resolutionNotes: "Adjusted belt tension and lubricated mounting bearings. Verified by user.",
    resolvedAt: new Date(Date.now() - 2 * 3600 * 1000).toISOString()
  },
  {
    id: "DEMO-5004",
    title: "Lobby HVAC airflow filter dirty and rattling",
    description: "Intake vent filter clogged with dust. Replaced with MERV 13 filter unit.",
    category: "HVAC",
    priority: "Routine",
    status: "Completed",
    techConfirmed: true,
    userConfirmed: true,
    location: "Demo Building D · Lobby HVAC Unit",
    assignedTo: "General Maintenance",
    isHazard: false,
    isDemo: true,
    reportedBy: {
      id: "usr_1",
      name: "Alex Rivera",
      role: "User",
      avatar: "https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=120&auto=format&fit=crop&q=80"
    },
    reporterId: "usr_1",
    photo: "https://images.unsplash.com/photo-1517646287270-a5a9ca602e5c?w=800&auto=format&fit=crop&q=80",
    createdAt: new Date(Date.now() - 28 * 3600 * 1000).toISOString(),
    updatedAt: new Date(Date.now() - 4 * 3600 * 1000).toISOString(),
    resolutionNotes: "Filter replaced and fan intake vacuumed. Flow rates restored to baseline.",
    resolvedAt: new Date(Date.now() - 4 * 3600 * 1000).toISOString()
  },
  {
    id: "REQ-10241",
    title: "Overhead lighting ballast flickering in Room 207",
    description: "Two fluorescent tubes humming and intermittent during morning lecture.",
    category: "Electrical",
    priority: "Routine",
    status: "Assigned",
    techConfirmed: false,
    userConfirmed: false,
    location: "Hartwell Hall · Room 207",
    assignedTo: "Electrical Tech",
    isHazard: false,
    isDemo: false,
    reportedBy: {
      id: "usr_3",
      name: "David Kim",
      role: "User",
      avatar: "https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=120&auto=format&fit=crop&q=80"
    },
    reporterId: "usr_3",
    photo: "https://images.unsplash.com/photo-1581092335397-9583fe92d232?w=800&auto=format&fit=crop&q=80",
    createdAt: new Date(Date.now() - 48 * 3600 * 1000).toISOString(),
    updatedAt: new Date(Date.now() - 48 * 3600 * 1000).toISOString(),
    resolutionNotes: null,
    resolvedAt: null
  },
  {
    id: "DEMO-5005",
    title: "Storage closet deadbolt jammed",
    description: "Key turns but bolt fails to engage striker plate.",
    category: "Other",
    priority: "Routine",
    status: "Completed",
    techConfirmed: true,
    userConfirmed: true,
    location: "Demo Building E · Storage Closet",
    assignedTo: "General Maintenance",
    isHazard: false,
    isDemo: true,
    reportedBy: {
      id: "usr_1",
      name: "Alex Rivera",
      role: "User",
      avatar: "https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=120&auto=format&fit=crop&q=80"
    },
    reporterId: "usr_1",
    photo: "https://images.unsplash.com/photo-1585704032915-c3400ca199e7?w=800&auto=format&fit=crop&q=80",
    createdAt: new Date(Date.now() - 50 * 3600 * 1000).toISOString(),
    updatedAt: new Date(Date.now() - 24 * 3600 * 1000).toISOString(),
    resolutionNotes: "Re-aligned latch faceplate and lubricated deadbolt cylinder.",
    resolvedAt: new Date(Date.now() - 24 * 3600 * 1000).toISOString()
  }
];

export const MOCK_USERS = {
  user: {
    id: "usr_1",
    name: "Alex Rivera",
    email: "alex.rivera@campus.maintainx.local",
    role: "user",
    roleDisplay: "Campus Reporter",
    department: "Facilities & Student Services",
    avatar: "https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=120&auto=format&fit=crop&q=80"
  },
  technician: {
    id: "tech_1",
    name: "Marcus Vance",
    email: "marcus.vance@maintenance.maintainx.local",
    role: "technician",
    roleDisplay: "Field Technician",
    specialty: "Electro-Mechanical & Plumbing",
    avatar: "https://images.unsplash.com/photo-1500648767791-00dcc994a43e?w=120&auto=format&fit=crop&q=80"
  },
  admin: {
    id: "adm_1",
    name: "Sarthak Chaudhary",
    email: "sarthak.chaudhary@management.maintainx.local",
    role: "admin",
    roleDisplay: "Manager",
    department: "Campus Facilities Operations",
    avatar: "https://images.unsplash.com/photo-1573496359142-b8d87734a5a2?w=120&auto=format&fit=crop&q=80"
  }
};

export const CATEGORIES = [
  { id: "Electrical", label: "Electrical", count: 4 },
  { id: "Plumbing", label: "Plumbing", count: 3 },
  { id: "Lift", label: "Lift", count: 2 },
  { id: "HVAC", label: "HVAC", count: 3 },
  { id: "Other", label: "Other", count: 2 },
];

export const PRIORITIES = [
  { id: "Routine", label: "Routine", badge: "bg-[#047857] text-white font-medium" },
  { id: "Urgent", label: "Urgent", badge: "bg-[#b45309] text-white font-medium" },
  { id: "Emergency", label: "Emergency", badge: "bg-[#b91c1c] text-white font-medium" },
];

export const STATUS_CONFIG = {
  Open: {
    label: "Assigned",
    pill: "bg-[#ede9fe] text-[#5b21b6]",
    dot: "bg-[#7c3aed]"
  },
  Assigned: {
    label: "Assigned",
    pill: "bg-[#ede9fe] text-[#5b21b6]",
    dot: "bg-[#7c3aed]"
  },
  "In Progress": {
    label: "In Progress",
    pill: "bg-[#fef3c7] text-[#92400e]",
    dot: "bg-[#d97706]"
  },
  "Pending User Verification": {
    label: "Pending User Verification",
    pill: "bg-yellow-100 text-yellow-800",
    dot: "bg-yellow-500"
  },
  Done: {
    label: "Completed",
    pill: "bg-green-100 text-green-700",
    dot: "bg-[#059669]"
  },
  Completed: {
    label: "Completed",
    pill: "bg-green-100 text-green-700",
    dot: "bg-[#059669]"
  }
};
