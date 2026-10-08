// The questionnaire: the engine's Job fields (ERS TURNING APP,
// ers_turning/job.py) that a person may set on a program. Pure data.
//
// Every field may be left blank, and blank means the engine decides, as it
// does on its own. Material and the program number are asked for apart
// (the New program form), so they are not in this list.
//
// Mirrors job.py: a field added to the engine is added here; a key the
// live engine does not know is refused by it (400 "unknown settings"),
// which is why only filled-in fields are ever sent (cleanSettings).

export const STOCK_TYPES = [
  { value: "bar", label: "Solid bar" },
  { value: "tube", label: "Tube" },
  { value: "schedule", label: "Pipe (schedule)" },
];

export const CNC_FIELDS = [
  { key: "stock_type", label: "Stock", kind: "choice", choices: STOCK_TYPES, blank: "Solid bar" },
  { key: "bar_dia", label: "Bar / tube OD (mm)", kind: "number", blank: "smallest standard bar that fits" },
  { key: "bar_id", label: "Tube ID (mm)", kind: "number", blank: "solid" },
  { key: "nps", label: "Pipe size (NPS)", kind: "text", blank: "engine picks" },
  { key: "schedule", label: "Pipe schedule", kind: "text", blank: "engine picks" },
  {
    key: "holding",
    label: "Holding",
    kind: "choice",
    choices: [
      { value: "double-chucked", label: "Double-chucked" },
      { value: "bar puller", label: "Bar puller" },
      { value: "magnet puller", label: "Magnet puller" },
    ],
    blank: "by size",
  },
  { key: "grip1", label: "Jaw grip side 1 (mm)", kind: "number", blank: "engine works it out" },
  { key: "grip2", label: "Jaw grip side 2 (mm)", kind: "number", blank: "engine works it out" },
  { key: "stock_extra", label: "Stock longer than the part (mm)", kind: "number", blank: "5" },
  { key: "pulls", label: "Pulls (mm each, e.g. 63, 33)", kind: "list", blank: "engine works them out" },
  { key: "pull_max_ld", label: "Max stick-out per pull (× bar dia)", kind: "number", blank: "4" },
  {
    key: "back_op",
    label: "Back end (bar work)",
    kind: "choice",
    choices: [
      { value: "part+turn", label: "Part and turn (program 2)" },
      { value: "part only", label: "Part only (deburr by hand)" },
    ],
    blank: "Part and turn",
  },
  { key: "edge_break", label: "Edge break (mm, 0 = off)", kind: "number", blank: "0.5" },
  {
    key: "finish_mode",
    label: "Finishing",
    kind: "choice",
    choices: [
      { value: "T1", label: "T1 rough + finish" },
      { value: "T2", label: "T1 rough / T2 finish" },
    ],
    blank: "T1 rough + finish",
  },
  {
    key: "nose_comp",
    label: "Nose-radius compensation",
    kind: "yesno",
    choices: [
      { value: true, label: "On" },
      { value: false, label: "Off" },
    ],
    blank: "Off",
  },
  {
    key: "side1",
    label: "Side 1 is the model's",
    kind: "choice",
    choices: [
      { value: "0", label: "0 end" },
      { value: "L", label: "L end" },
    ],
    blank: "engine decides",
  },
  { key: "qty", label: "Quantity (for costing)", kind: "number", whole: true, blank: "1" },
];
