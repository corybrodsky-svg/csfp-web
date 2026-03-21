"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { supabase } from "../../lib/supabaseClient";

type EventDetailRow = {
  id: string;
  name: string | null;
  status: string | null;
  date_text: string | null;
  sp_needed: number | null;
  sp_assigned: number | null;
  visibility: string | null;
  location: string | null;
  zoom_link: string | null;
  training_info: string | null;
  faculty_contact: string | null;
  notes: string | null;
};

export default function EventDetailPage() {
  const params = useParams();
  const id = typeof params?.id === "string" ? params.id : "";

  const [event, setEvent] = useState<EventDetailRow | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function loadEvent() {
      const { data } = await supabase
        .from("events")
        .select("*")
        .eq("id", id)
        .single();

      setEvent(data);
      setLoading(false);
    }

    if (id) loadEvent();
  }, [id]);

  if (loading) return <div style={{ padding: 20 }}>Loading...</div>;
  if (!event) return <div style={{ padding: 20 }}>Event not found.</div>;

  return (
    <div style={{ padding: 24 }}>
      <Link href="/events">← Back to Events</Link>

      <h1 style={{ marginTop: 20 }}>{event.name}</h1>
      <p>{event.date_text}</p>

      <div style={{ marginTop: 20 }}>
        <p><strong>Status:</strong> {event.status}</p>
        <p><strong>Visibility:</strong> {event.visibility}</p>
        <p><strong>SP Needed:</strong> {event.sp_needed}</p>
        <p><strong>SP Assigned:</strong> {event.sp_assigned}</p>
        <p><strong>Location:</strong> {event.location}</p>
        <p><strong>Notes:</strong> {event.notes}</p>
      </div>
    </div>
  );
}
