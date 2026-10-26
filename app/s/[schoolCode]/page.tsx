"use client";

import { use } from "react";
import SchoolLogin from "@/components/auth/SchoolLogin";

/** A school's own entry link: /s/<school code>. Branding comes from the layout above. */
export default function SchoolEntryPage({ params }: { params: Promise<{ schoolCode: string }> }) {
  const { schoolCode } = use(params);
  return <SchoolLogin schoolCode={schoolCode.toLowerCase()} />;
}
