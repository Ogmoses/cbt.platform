"use client";

/**
 * LabBatchesManager — school-wide lab setup: the physical rooms/computer
 * labs, and reusable daily time-slot templates (e.g. "Batch A: 8:00–9:00").
 * Teachers pick from these templates in the Exam Builder instead of typing
 * the same time windows into every exam.
 */

import { useState } from "react";
import { Plus, Pencil, Trash2, X, Loader2, MonitorPlay, Clock3 } from "lucide-react";
import type { BatchTemplate, LabRoom } from "./types";

type Tab = "rooms" | "templates";

interface LabBatchesManagerProps {
  rooms: LabRoom[];
  templates: BatchTemplate[];
  onSaveRoom: (r: Omit<LabRoom, "id"> & { id?: string }) => Promise<void>;
  onDeleteRoom: (id: string) => Promise<void>;
  onSaveTemplate: (t: Omit<BatchTemplate, "id"> & { id?: string }) => Promise<void>;
  onDeleteTemplate: (id: string) => Promise<void>;
}

export default function LabBatchesManager({ rooms, templates, onSaveRoom, onDeleteRoom, onSaveTemplate, onDeleteTemplate }: LabBatchesManagerProps) {
  const [tab, setTab] = useState<Tab>("templates");
  const [roomEditor, setRoomEditor] = useState<"closed" | "new" | LabRoom>("closed");
  const [templateEditor, setTemplateEditor] = useState<"closed" | "new" | BatchTemplate>("closed");

  return (
    <div className="pb-10">
      <h1 className="font-display text-[18px] font-semibold text-ink dark:text-white sm:text-[20px]">Lab batches</h1>
      <p className="mt-0.5 text-[13px] text-ink/50 dark:text-white/50">Rooms and standard time slots teachers reuse when scheduling exams.</p>

      <div className="mt-4 mb-5 grid w-full max-w-xs grid-cols-2 rounded-lg bg-background-muted dark:bg-white/5 p-1">
        {([["templates", "Batch templates"], ["rooms", "Lab rooms"]] as [Tab, string][]).map(([t, label]) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`rounded-md py-2 text-[12px] font-semibold transition-colors duration-200 ${tab === t ? "bg-white dark:bg-[#1A1C20] text-crimson-700 dark:text-crimson-500 shadow-card" : "text-ink/50 dark:text-white/50"}`}
          >
            {label}
          </button>
        ))}
      </div>

      {tab === "templates" ? (
        <div>
          <div className="mb-3 flex justify-end">
            <button onClick={() => setTemplateEditor("new")} className="flex items-center gap-1.5 rounded-lg bg-crimson-600 px-3.5 py-2 text-[12.5px] font-semibold text-on-crimson hover:bg-crimson-700">
              <Plus size={14} /> New template
            </button>
          </div>
          {templates.length === 0 ? (
            <EmptyRow message="No batch templates yet — add the school's standard time slots." />
          ) : (
            <div className="divide-y divide-black/5 dark:divide-white/10 rounded-lg border border-black/5 dark:border-white/10 bg-white dark:bg-[#1A1C20]">
              {templates.map((t) => (
                <div key={t.id} className="flex flex-col gap-2 px-4 py-3.5 sm:flex-row sm:items-center sm:px-5">
                  <div className="flex min-w-0 flex-1 items-center gap-3">
                    <Clock3 size={16} className="shrink-0 text-crimson-600" />
                    <div className="min-w-0 flex-1">
                      <p className="text-[13.5px] font-medium text-ink dark:text-white">{t.label}</p>
                      <p className="text-[12px] text-ink/45 dark:text-white/45">{formatTime(t.startTime)} – {formatTime(t.endTime)}</p>
                    </div>
                  </div>
                  <div className="flex shrink-0 items-center gap-1 self-end sm:self-auto">
                    <button onClick={() => setTemplateEditor(t)} className="rounded-md p-1.5 text-ink/40 dark:text-white/40 hover:bg-background-muted dark:hover:bg-white/5 hover:text-ink dark:hover:text-white">
                      <Pencil size={15} />
                    </button>
                    <button onClick={() => onDeleteTemplate(t.id)} className="rounded-md p-1.5 text-ink/40 dark:text-white/40 hover:bg-crimson-50 dark:hover:bg-crimson-600/15 hover:text-crimson-700 dark:hover:text-crimson-500">
                      <Trash2 size={15} />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      ) : (
        <div>
          <div className="mb-3 flex justify-end">
            <button onClick={() => setRoomEditor("new")} className="flex items-center gap-1.5 rounded-lg bg-crimson-600 px-3.5 py-2 text-[12.5px] font-semibold text-on-crimson hover:bg-crimson-700">
              <Plus size={14} /> New room
            </button>
          </div>
          {rooms.length === 0 ? (
            <EmptyRow message="No lab rooms yet — add the school's computer labs." />
          ) : (
            <div className="divide-y divide-black/5 dark:divide-white/10 rounded-lg border border-black/5 dark:border-white/10 bg-white dark:bg-[#1A1C20]">
              {rooms.map((r) => (
                <div key={r.id} className="flex flex-col gap-2 px-4 py-3.5 sm:flex-row sm:items-center sm:px-5">
                  <div className="flex min-w-0 flex-1 items-center gap-3">
                    <MonitorPlay size={16} className="shrink-0 text-crimson-600" />
                    <div className="min-w-0 flex-1">
                      <p className="text-[13.5px] font-medium text-ink dark:text-white">{r.name}</p>
                      <p className="text-[12px] text-ink/45 dark:text-white/45">{r.capacity} computers</p>
                    </div>
                  </div>
                  <div className="flex shrink-0 items-center gap-1 self-end sm:self-auto">
                    <button onClick={() => setRoomEditor(r)} className="rounded-md p-1.5 text-ink/40 dark:text-white/40 hover:bg-background-muted dark:hover:bg-white/5 hover:text-ink dark:hover:text-white">
                      <Pencil size={15} />
                    </button>
                    <button onClick={() => onDeleteRoom(r.id)} className="rounded-md p-1.5 text-ink/40 dark:text-white/40 hover:bg-crimson-50 dark:hover:bg-crimson-600/15 hover:text-crimson-700 dark:hover:text-crimson-500">
                      <Trash2 size={15} />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {templateEditor !== "closed" && (
        <TemplateEditor
          key={templateEditor === "new" ? "new" : templateEditor.id}
          initial={templateEditor === "new" ? null : templateEditor}
          onSave={async (t) => {
            await onSaveTemplate(t);
            setTemplateEditor("closed");
          }}
          onCancel={() => setTemplateEditor("closed")}
        />
      )}

      {roomEditor !== "closed" && (
        <RoomEditor
          key={roomEditor === "new" ? "new" : roomEditor.id}
          initial={roomEditor === "new" ? null : roomEditor}
          onSave={async (r) => {
            await onSaveRoom(r);
            setRoomEditor("closed");
          }}
          onCancel={() => setRoomEditor("closed")}
        />
      )}
    </div>
  );
}

function EmptyRow({ message }: { message: string }) {
  return <div className="rounded-lg border border-dashed border-black/10 dark:border-white/15 bg-white dark:bg-[#1A1C20] px-4 py-8 text-center text-[13px] text-ink/45 dark:text-white/45">{message}</div>;
}

function formatTime(t: string): string {
  const [h, m] = t.split(":").map(Number);
  const d = new Date();
  d.setHours(h, m, 0, 0);
  return d.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
}

function TemplateEditor({ initial, onSave, onCancel }: { initial?: BatchTemplate | null; onSave: (t: Omit<BatchTemplate, "id"> & { id?: string }) => Promise<void>; onCancel: () => void }) {
  const [label, setLabel] = useState(initial?.label ?? `Batch ${String.fromCharCode(65)}`);
  const [startTime, setStartTime] = useState(initial?.startTime ?? "08:00");
  const [endTime, setEndTime] = useState(initial?.endTime ?? "09:00");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const submit = async () => {
    if (!label.trim()) return setError("Give the batch a label.");
    if (endTime <= startTime) return setError("End time must be after start time.");
    setSaving(true);
    try {
      await onSave({ id: initial?.id, label: label.trim(), startTime, endTime });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't save.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <ModalShell title={initial ? "Edit batch template" : "New batch template"} onCancel={onCancel} onSubmit={submit} saving={saving} error={error}>
      <label className="block">
        <span className="mb-1 block text-[12px] font-medium text-ink/60 dark:text-white/60">Label</span>
        <input value={label} onChange={(e) => setLabel(e.target.value)} className="w-full rounded-lg border border-black/10 dark:border-white/15 px-3.5 py-2.5 text-[13px] outline-none focus:border-crimson-500" />
      </label>
      <div className="grid grid-cols-2 gap-2.5">
        <label className="block">
          <span className="mb-1 block text-[12px] font-medium text-ink/60 dark:text-white/60">Starts</span>
          <input type="time" value={startTime} onChange={(e) => setStartTime(e.target.value)} className="w-full rounded-lg border border-black/10 dark:border-white/15 px-3.5 py-2.5 text-[13px] outline-none focus:border-crimson-500" />
        </label>
        <label className="block">
          <span className="mb-1 block text-[12px] font-medium text-ink/60 dark:text-white/60">Ends</span>
          <input type="time" value={endTime} onChange={(e) => setEndTime(e.target.value)} className="w-full rounded-lg border border-black/10 dark:border-white/15 px-3.5 py-2.5 text-[13px] outline-none focus:border-crimson-500" />
        </label>
      </div>
    </ModalShell>
  );
}

function RoomEditor({ initial, onSave, onCancel }: { initial?: LabRoom | null; onSave: (r: Omit<LabRoom, "id"> & { id?: string }) => Promise<void>; onCancel: () => void }) {
  const [name, setName] = useState(initial?.name ?? "");
  const [capacity, setCapacity] = useState(initial?.capacity ?? 30);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const submit = async () => {
    if (!name.trim()) return setError("Name the room, e.g. Computer Lab 1.");
    setSaving(true);
    try {
      await onSave({ id: initial?.id, name: name.trim(), capacity });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't save.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <ModalShell title={initial ? "Edit lab room" : "New lab room"} onCancel={onCancel} onSubmit={submit} saving={saving} error={error}>
      <label className="block">
        <span className="mb-1 block text-[12px] font-medium text-ink/60 dark:text-white/60">Room name</span>
        <input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Computer Lab 1" className="w-full rounded-lg border border-black/10 dark:border-white/15 px-3.5 py-2.5 text-[13px] outline-none focus:border-crimson-500" />
      </label>
      <label className="block">
        <span className="mb-1 block text-[12px] font-medium text-ink/60 dark:text-white/60">Computers available</span>
        <input type="number" min={1} value={capacity} onChange={(e) => setCapacity(Number(e.target.value))} className="w-full rounded-lg border border-black/10 dark:border-white/15 px-3.5 py-2.5 text-[13px] outline-none focus:border-crimson-500" />
      </label>
    </ModalShell>
  );
}

function ModalShell({ title, onCancel, onSubmit, saving, error, children }: { title: string; onCancel: () => void; onSubmit: () => void; saving: boolean; error: string | null; children: React.ReactNode }) {
  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-ink/50 p-4">
      <div className="w-full max-w-sm rounded-lg bg-white dark:bg-[#1A1C20] shadow-card-hover">
        <div className="flex items-center justify-between border-b border-black/5 dark:border-white/10 px-5 py-4">
          <h2 className="font-display text-[15px] font-semibold text-ink dark:text-white">{title}</h2>
          <button onClick={onCancel} className="rounded-md p-1.5 text-ink/40 dark:text-white/40 hover:bg-background-muted dark:hover:bg-white/5">
            <X size={18} />
          </button>
        </div>
        <div className="space-y-3.5 px-5 py-4">
          {children}
          {error && <p className="rounded-md bg-crimson-50 dark:bg-crimson-600/15 px-3 py-2 text-[12.5px] text-crimson-700 dark:text-crimson-500">{error}</p>}
        </div>
        <div className="flex gap-2.5 border-t border-black/5 dark:border-white/10 px-5 py-4">
          <button onClick={onCancel} disabled={saving} className="flex-1 rounded-lg border border-black/10 dark:border-white/15 py-2.5 text-[13px] font-medium text-ink/70 dark:text-white/70 hover:bg-background-muted dark:hover:bg-white/5 disabled:opacity-50">
            Cancel
          </button>
          <button onClick={onSubmit} disabled={saving} className="flex flex-1 items-center justify-center gap-1.5 rounded-lg bg-crimson-600 py-2.5 text-[13px] font-semibold text-on-crimson hover:bg-crimson-700 disabled:opacity-70">
            {saving && <Loader2 size={14} className="animate-spin" />}
            {saving ? "Saving…" : "Save"}
          </button>
        </div>
      </div>
    </div>
  );
}
