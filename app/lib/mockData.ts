export type EventStatus = "Needs SPs" | "Scheduled" | "In Progress" | "Complete";

export type EventItem = {
  id: string;
  name: string;
  status: EventStatus;
  dateText: string;
  spNeeded: number;
  spAssigned: number;
  visibility: "Team" | "Personal";
  location: string;
  notes: string;
};

export type SPItem = {
  id: string;
  fullName: string;
  email: string;
  phone: string;
  portrayalAge: string;
  raceSex: string;
  status: "Active" | "Inactive";
  notes: string;
};

export const events: EventItem[] = [
  {
    id: "n651-virtual",
    name: "N651 Virtual",
    status: "Needs SPs",
    dateText: "3/10, 3/11",
    spNeeded: 6,
    spAssigned: 2,
    visibility: "Team",
    location: "Zoom",
    notes: "Virtual nursing event. Need additional SP coverage.",
  },
  {
    id: "nupr706-vir",
    name: "NUPR706 VIR",
    status: "Scheduled",
    dateText: "3/15",
    spNeeded: 4,
    spAssigned: 4,
    visibility: "Team",
    location: "Elkins Park",
    notes: "Faculty confirmed. Training complete.",
  },
];

export const sps: SPItem[] = [
  {
    id: "allen-adair",
    fullName: "Allen Adair",
    email: "Apadair01@gmail.com",
    phone: "970-712-9623",
    portrayalAge: "20's",
    raceSex: "W / M",
    status: "Active",
    notes: "Strong communication. Good fit for student-facing encounters.",
  },
  {
    id: "amy-fitzpatrick",
    fullName: "Amy Fitzpatrick",
    email: "amf346@drexel.edu",
    phone: "267-275-6971",
    portrayalAge: "68",
    raceSex: "W / F",
    status: "Active",
    notes: "Reliable. Great for older adult portrayals.",
  },
];
