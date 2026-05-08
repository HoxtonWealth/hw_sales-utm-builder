export const ACTIVITY_IDS: Record<string, string> = {
  "act::r": "Received email",
  "act::s": "Sent email",
  "act::o": "Opened email",
  "act::c": "Clicked email",
  "act::b": "Bounced email",
  "act::es": "Email suppressed",
  "act::ds": "Delivered SMS",
  "act::wad": "Delivered WhatsApp",
  "act:fb:l": "Facebook lead ad submitted",
  "act:gl:l": "Google lead ad submitted",
  "act:ln:l": "LinkedIn lead ad submitted",
  "act:cm:website-form-submitted": "Website Form Submitted",
  "act:cm:trengochatbotcapture": "Chatbot Contact Captured",
  "act:cm:webinar-form-submitted": "Webinar Form Submitted",
  "act:cm:scoreapp-form-submitted": "ScoreApp Form Submitted",
  "act:cm:partnership-lead-submitted": "Partnership Lead Submitted",
  "act:cl:invitee_created": "Calendly invitee created",
  "act:wf:68dcd96727c1e2987a49e940": "Submitted widget form",
  "act:wf:68f21964c9c678d0833cf0b8": "Submitted landing page form",
  "act:wf:68f2197c380a92dd6a959e4e": "Submitted landing page form",
  "act:wf:690de33a61180f08732598c4": "Submitted landing page form",
  "act:wf:690de33a61180f08732598c5": "Submitted landing page form",
  "act::swf": "Submitted widget form",
  "act::lpc": "Landing page clicked",
  "act::lpv": "Landing page viewed",
  "act::us": "User session",
};

export const ACTIVITY_GROUPS: Record<
  string,
  { label: string; color: string; bg: string; activityIds: string[] }
> = {
  email: {
    label: "Email",
    color: "text-blue-700",
    bg: "bg-blue-100",
    activityIds: ["act::r", "act::s", "act::o", "act::c", "act::b", "act::es"],
  },
  sms: {
    label: "SMS",
    color: "text-green-700",
    bg: "bg-green-100",
    activityIds: ["act::ds"],
  },
  whatsapp: {
    label: "WhatsApp",
    color: "text-emerald-700",
    bg: "bg-emerald-100",
    activityIds: ["act::wad"],
  },
  leadAds: {
    label: "Lead Ads",
    color: "text-purple-700",
    bg: "bg-purple-100",
    activityIds: ["act:fb:l", "act:gl:l", "act:ln:l"],
  },
  forms: {
    label: "Forms & Captures",
    color: "text-orange-700",
    bg: "bg-orange-100",
    activityIds: [
      "act:cm:website-form-submitted",
      "act:cm:trengochatbotcapture",
      "act:cm:webinar-form-submitted",
      "act:cm:scoreapp-form-submitted",
      "act:cm:partnership-lead-submitted",
      "act::swf",
      "act:wf:",
      "act:cl:invitee_created",
    ],
  },
  pages: {
    label: "Landing Pages",
    color: "text-cyan-700",
    bg: "bg-cyan-100",
    activityIds: ["act::lpc", "act::lpv"],
  },
  sessions: {
    label: "Sessions",
    color: "text-gray-700",
    bg: "bg-gray-200",
    activityIds: ["act::us"],
  },
};

export const CONTACT_FIELDS = [
  "str::email",
  "str::first",
  "str::last",
  "str:cm:hxt-id",
  "str:cm:linkedin-url",
  "phn::phone",
  "pho::pn",
  "str::ph",
  "str::mp",
  "c",
];

// Field ids checked when reading a contact's primary phone. Ortto returns
// phone under different keys depending on how the field was created on the
// account, so we try them in order and use the first non-empty value.
export const PHONE_FIELD_CANDIDATES = [
  "phn::phone",
  "pho::pn",
  "str::ph",
  "str::mp",
];
