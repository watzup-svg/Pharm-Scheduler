import { DEFAULT_PRINT_PREFS } from "./types.ts";
import type { ScheduleDoc, Store } from "./types.ts";

const HOLIDAY_NOTE = "No chainwide schedule published; call ahead";

/**
 * Locations with a pharmacy, from the tables supplied 2026-09-30. Hardware-only stores are not
 * here. Clatskanie, Independence and Silverton share a building with One-Stop Hardware; only
 * the pharmacy is scheduled. Saturday open or closed comes from the posted hours; Sunday is
 * closed everywhere. lat/lng are approximate town locations, used only for distance hints. No holiday closures are known, so none are added: enter them on the
 * Holidays page as they are confirmed.
 */
/**
 * Store numbers come from the HSP Float Store List (Oct 2026). Cave’s, Len’s and Rogue River are not on that list, so
 * they have no number yet (they show their letters). Scappoose (1165), West Linn (4900) and Mt Angel (1177) closed for good.
 * Change a number here, or per store on the Stores page (Edit → Store number).
 */
const STORE_NUMBERS: Record<string, string> = {"CAT": "1148", "CLA": "1147", "EST": "1152", "FLO": "1184", "IND": "2700", "MOT": "600", "MOL": "1167", "SHE": "1155", "SIL": "1178", "WAL": "1187", "WS": "3500", "WIN": "1179", "WOO": "2100"};
export const HI_SCHOOL_STORES: Store[] = ([
  { code: "CAT", lat: 46.2029, lng: -123.3835, name: "Cathlamet Pharmacy", address: "74 Main St, Cathlamet, WA 98612", phone: "(360) 795-3691", hours: "Mon–Fri 9:00 AM–6:00 PM (lunch 12:30–1:30); Sat–Sun closed", holidayNote: HOLIDAY_NOTE, satOpen: false, sunOpen: false },
  { code: "CAV", lat: 42.1626, lng: -123.6481, name: "Cave’s Pharmacy", address: "333 S Redwood Hwy, Cave Junction, OR 97523", phone: "(541) 592-4560", hours: "Mon–Fri 9:00 AM–6:00 PM (lunch 1:00–2:00); Sat–Sun closed", holidayNote: HOLIDAY_NOTE, satOpen: false, sunOpen: false },
  { code: "CLA", lat: 46.1015, lng: -123.2068, name: "Rick’s Hi-School Pharmacy", address: "401 W Columbia River Hwy, Clatskanie, OR 97016", phone: "(503) 728-2102", hours: "Mon–Fri 9:30 AM–6:00 PM; Sat–Sun closed", holidayNote: HOLIDAY_NOTE, satOpen: false, sunOpen: false },
  { code: "EST", lat: 45.2887, lng: -122.3326, name: "Estacada Hi-School Pharmacy", address: "207 S Broadway St, Estacada, OR 97023", phone: "(503) 630-3266", hours: "Mon–Fri 9:00 AM–6:00 PM; Sat 9:00 AM–2:00 PM; Sun closed", holidayNote: HOLIDAY_NOTE, satOpen: true, sunOpen: false },
  { code: "FLO", lat: 43.9826, lng: -124.0999, name: "Florence Pharmacy", address: "2935 Hwy 101, Florence, OR 97439", phone: "(541) 902-9966", hours: "Mon–Fri 9:00 AM–6:00 PM (lunch 12:30–1:30); Sat–Sun closed", holidayNote: HOLIDAY_NOTE, satOpen: false, sunOpen: false },
  { code: "IND", lat: 44.8512, lng: -123.1868, name: "Independence Hi-School Pharmacy", address: "1357 Monmouth St, Independence, OR 97351", phone: "(503) 838-2195", hours: "Mon–Fri 9:00 AM–7:00 PM (lunch 12:30–1:30); Sat 9:00 AM–2:00 PM; Sun closed", holidayNote: HOLIDAY_NOTE, satOpen: true, sunOpen: false },
  { code: "LEN", lat: 44.4163, lng: -118.9531, name: "Len’s Pharmacy", address: "120 E Main St, John Day, OR 97845", phone: "(541) 575-0629", hours: "Mon–Fri 8:30 AM–6:00 PM; Sat 8:30 AM–4:00 PM; Sun closed", holidayNote: HOLIDAY_NOTE, satOpen: true, sunOpen: false },
  { code: "MOT", lat: 45.6587, lng: -122.5686, name: "Medicine on Time (long-term care)", address: "6926 NE Fourth Plain Blvd, Ste B, Vancouver, WA 98661", phone: "(360) 693-8374", hours: "Mon–Fri 9:00 AM–5:00 PM; Sat–Sun closed. Closed-door long-term-care pharmacy, no retail counter", holidayNote: HOLIDAY_NOTE, satOpen: false, sunOpen: false },
  { code: "MOL", lat: 45.1476, lng: -122.5773, name: "Cutter’s Hi-School Pharmacy", address: "103 Robbins St, Molalla, OR 97038", phone: "(503) 829-9111", hours: "Mon–Fri 9:00 AM–7:00 PM; Sat 9:00 AM–2:00 PM; Sun closed", holidayNote: HOLIDAY_NOTE, satOpen: true, sunOpen: false },
  { code: "RR", lat: 42.4359, lng: -123.1706, name: "Rogue River Pharmacy", address: "506 E Main St, Rogue River, OR 97537", phone: "(541) 582-0559", hours: "Mon–Fri 9:00 AM–6:00 PM; Sat–Sun closed", holidayNote: HOLIDAY_NOTE, satOpen: false, sunOpen: false },
  { code: "SHE", lat: 45.0965, lng: -123.3976, name: "Sheridan Pharmacy", address: "103 E Main St, Sheridan, OR 97378", phone: "(503) 843-2422", hours: "Mon–Fri 9:00 AM–6:00 PM; Sat 9:00 AM–2:00 PM; Sun closed", holidayNote: HOLIDAY_NOTE, satOpen: true, sunOpen: false },
  { code: "SIL", lat: 44.9793, lng: -122.7834, name: "Silverton Hi-School Pharmacy", address: "406 McClaine St, Silverton, OR 97381", phone: "(503) 873-8391", hours: "Mon–Fri 9:00 AM–7:00 PM; Sat 9:00 AM–5:00 PM; Sun closed", holidayNote: HOLIDAY_NOTE, satOpen: true, sunOpen: false },
  { code: "WAL", lat: 44.4262, lng: -124.0632, name: "Waldport Hi-School Pharmacy", address: "110 SW Hwy 101, Waldport, OR 97394", phone: "(541) 563-4848", hours: "Mon–Fri 9:00 AM–6:00 PM; Sat–Sun closed", holidayNote: HOLIDAY_NOTE, satOpen: false, sunOpen: false },
  { code: "WS", lat: 45.7273, lng: -121.4862, name: "White Salmon Hi-School Pharmacy", address: "291 E Jewett Blvd, White Salmon, WA 98672", phone: "(509) 493-4842", hours: "Mon–Fri 9:00 AM–6:00 PM (lunch 12:30–1:30); Sat–Sun closed", holidayNote: HOLIDAY_NOTE, satOpen: false, sunOpen: false },
  { code: "WIN", lat: 45.6959, lng: -121.8848, name: "Wind River Pharmacy", address: "280 SW 2nd St, Stevenson, WA 98648", phone: "(509) 427-5480", hours: "Mon–Fri 9:00 AM–6:00 PM (lunch 12:30–1:30); Sat 9:00 AM–2:00 PM; Sun closed", holidayNote: HOLIDAY_NOTE, satOpen: true, sunOpen: false },
  { code: "WOO", lat: 45.9046, lng: -122.744, name: "Woodland Hi-School Pharmacy", address: "1365 Lewis River Rd, Woodland, WA 98674", phone: "(360) 225-9475", hours: "Mon–Fri 9:00 AM–7:00 PM (lunch 12:30–1:30); Sat 9:00 AM–2:00 PM; Sun closed", holidayNote: HOLIDAY_NOTE, satOpen: true, sunOpen: false },
] as Store[]).map((s) => (STORE_NUMBERS[s.code] ? { ...s, number: STORE_NUMBERS[s.code] } : s));

/** Every Hi-School pharmacy, no people and nobody placed. Repeating holidays carry over. */
export function blankMonthWithStores(from: ScheduleDoc): ScheduleDoc {
  return {
    format: "hischool-schedule",
    version: 2,
    year: from.year,
    month: from.month,
    stores: HI_SCHOOL_STORES.map((s) => ({ ...s })),
    people: [],
    holidays: from.holidays.filter((h) => h.repeat),
    ...(from.storeLabels ? { storeLabels: from.storeLabels } : {}),
    timeOff: [],
    grid: {},
    pattern: {},
    dayNotes: {},
    printPrefs: { ...DEFAULT_PRINT_PREFS },
  };
}
