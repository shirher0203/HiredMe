function toGoogleUtc(d: Date): string {
  return d.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z");
}

export function buildGoogleCalendarTemplateUrl(input: {
  title: string;
  startAt: Date;
  endAt: Date;
}): string {
  const params = new URLSearchParams({
    action: "TEMPLATE",
    text: input.title,
    dates: `${toGoogleUtc(input.startAt)}/${toGoogleUtc(input.endAt)}`,
  });
  return `https://calendar.google.com/calendar/render?${params.toString()}`;
}

export function buildInterviewCalendarTitle(job: { title: string; company: string | null }): string {
  if (job.company) {
    return `Technical Interview at ${job.company}`;
  }
  return `Technical Interview — ${job.title}`;
}

export function openGoogleCalendarEvent(url: string): void {
  window.open(url, "_blank", "noopener,noreferrer");
}
