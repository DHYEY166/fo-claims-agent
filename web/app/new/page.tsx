"use client";
import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowRight, ClipboardPaste, Copy, Check, FileUp, Forward, Loader2, Paperclip, ShieldCheck, X } from "lucide-react";
import { api } from "@/lib/api";
import { cx } from "@/components/ui";

type Tab = "paste" | "upload" | "forward";
const FORWARD_ADDR = "claims@gsd-demo.example";
const EXAMPLES = [
  { label: "Double charge", text: "My Chase Sapphire card was charged twice for $184.20 at Blue Bottle Coffee on Oct 9. I only placed one order (#BB-20931). Please dispute the duplicate charge." },
  { label: "Lost package", text: "UPS marked my package (tracking 1Z999AA10123456784) as delivered but it never arrived. It was an Anker power bank worth $89.99." },
  { label: "Stolen bike", text: "My Trek bike was stolen from outside my building. Lemonade renters insurance policy LM-88213. Bike cost $650." },
];

export default function NewClaimPage() {
  const router = useRouter();
  const [tab, setTab] = useState<Tab>("paste");
  const [text, setText] = useState("");
  const [notes, setNotes] = useState("");
  const [forwarded, setForwarded] = useState("");
  const [files, setFiles] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const body = tab === "paste" ? text : tab === "forward" ? forwarded : notes;
  const canSubmit = !busy && (tab === "upload" ? files.length > 0 || notes.trim().length > 0 : body.trim().length > 0);

  async function submit() {
    setBusy(true); setErr(null);
    try {
      const c = await api.createCase({ source: tab, text: body, ...(tab === "upload" ? { filenames: files } : {}) });
      router.push(`/cases/${c.id}`);
    } catch (e) { setErr(String(e)); setBusy(false); }
  }

  const tabs: { id: Tab; label: string; Icon: typeof FileUp }[] = [
    { id: "paste", label: "Paste", Icon: ClipboardPaste },
    { id: "upload", label: "Upload", Icon: FileUp },
    { id: "forward", label: "Forward", Icon: Forward },
  ];

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Submit a claim</h1>
        <p className="mt-1 text-sm text-zinc-500">Describe what went wrong. The agent classifies it, gathers evidence, and asks before it acts.</p>
      </div>

      <div className="rounded-xl border border-zinc-200 bg-white shadow-sm">
        <div className="flex gap-1 border-b border-zinc-100 p-1.5">
          {tabs.map((t) => (
            <button key={t.id} onClick={() => setTab(t.id)}
              className={cx("inline-flex flex-1 items-center justify-center gap-2 rounded-lg px-3 py-2 text-sm transition",
                tab === t.id ? "bg-zinc-900 font-medium text-white shadow-sm" : "text-zinc-500 hover:bg-zinc-50 hover:text-zinc-900")}>
              <t.Icon className="h-4 w-4" /> {t.label}
            </button>
          ))}
        </div>

        <div className="space-y-4 p-5">
          {tab === "paste" && (
            <>
              <label className="block text-sm font-medium text-zinc-800">What happened?</label>
              <textarea value={text} onChange={(e) => setText(e.target.value)} rows={7}
                placeholder="e.g. I was double-charged $184.20 by Blue Bottle Coffee on my Chase card…"
                className="w-full resize-none rounded-lg border border-zinc-200 bg-zinc-50/50 px-3.5 py-3 text-sm leading-relaxed outline-none transition placeholder:text-zinc-400 focus:border-accent-500 focus:bg-white focus:ring-4 focus:ring-accent-100" />
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-xs text-zinc-400">Try an example:</span>
                {EXAMPLES.map((ex) => (
                  <button key={ex.label} onClick={() => setText(ex.text)}
                    className="rounded-full border border-zinc-200 px-2.5 py-1 text-xs text-zinc-600 transition hover:border-zinc-300 hover:bg-zinc-50">{ex.label}</button>
                ))}
              </div>
            </>
          )}

          {tab === "upload" && (
            <>
              <button onClick={() => fileRef.current?.click()}
                className="flex w-full flex-col items-center justify-center gap-2 rounded-lg border border-dashed border-zinc-300 bg-zinc-50/50 px-4 py-10 text-sm text-zinc-500 transition hover:border-accent-500 hover:bg-accent-50/40">
                <FileUp className="h-5 w-5 text-zinc-400" />
                <span><span className="font-medium text-accent-600">Choose files</span> — receipts, screenshots, statements</span>
                <span className="text-xs text-zinc-400">PNG, JPG, PDF · only filenames are sent in the demo</span>
              </button>
              <input ref={fileRef} type="file" multiple className="hidden" accept="image/*,.pdf"
                onChange={(e) => { const n = Array.from(e.target.files ?? []).map((f) => f.name); setFiles((p) => [...new Set([...p, ...n])]); e.target.value = ""; }} />
              {files.length > 0 && (
                <ul className="space-y-1.5">
                  {files.map((f) => (
                    <li key={f} className="flex items-center gap-2 rounded-md border border-zinc-200 px-3 py-2 text-sm">
                      <Paperclip className="h-3.5 w-3.5 text-zinc-400" /><span className="truncate">{f}</span>
                      <button onClick={() => setFiles((p) => p.filter((x) => x !== f))} className="ml-auto text-zinc-400 hover:text-zinc-700"><X className="h-3.5 w-3.5" /></button>
                    </li>
                  ))}
                </ul>
              )}
              <input value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Optional note (e.g. UPS package never arrived, $89.99)"
                className="w-full rounded-lg border border-zinc-200 px-3.5 py-2.5 text-sm outline-none transition placeholder:text-zinc-400 focus:border-accent-500 focus:ring-4 focus:ring-accent-100" />
            </>
          )}

          {tab === "forward" && (
            <>
              <div className="flex items-center justify-between gap-3 rounded-lg border border-zinc-200 bg-zinc-50 px-4 py-3">
                <div>
                  <div className="text-xs text-zinc-500">Forward receipts or merchant emails to</div>
                  <div className="font-mono text-sm font-medium text-zinc-900">{FORWARD_ADDR}</div>
                </div>
                <button onClick={() => { navigator.clipboard?.writeText(FORWARD_ADDR).catch(() => {}); setCopied(true); setTimeout(() => setCopied(false), 1500); }}
                  className="inline-flex items-center gap-1.5 rounded-md border border-zinc-200 bg-white px-2.5 py-1.5 text-xs font-medium text-zinc-700 hover:bg-zinc-50">
                  {copied ? <Check className="h-3.5 w-3.5 text-emerald-600" /> : <Copy className="h-3.5 w-3.5" />}{copied ? "Copied" : "Copy"}
                </button>
              </div>
              <label className="block text-sm font-medium text-zinc-800">…or paste the forwarded email</label>
              <textarea value={forwarded} onChange={(e) => setForwarded(e.target.value)} rows={7}
                placeholder={"---------- Forwarded message ---------\nFrom: Chase <no-reply@chase.example>\nSubject: Transaction alert: $184.20 at BLUE BOTTLE COFFEE"}
                className="w-full resize-none rounded-lg border border-zinc-200 bg-zinc-50/50 px-3.5 py-3 font-mono text-xs leading-relaxed outline-none transition placeholder:text-zinc-400 focus:border-accent-500 focus:bg-white focus:ring-4 focus:ring-accent-100" />
            </>
          )}

          {err && <p className="text-sm text-rose-600">{err}</p>}
        </div>

        <div className="flex items-center justify-between gap-4 border-t border-zinc-100 bg-zinc-50/60 px-5 py-3.5">
          <p className="flex items-center gap-1.5 text-xs text-zinc-500"><ShieldCheck className="h-3.5 w-3.5 text-emerald-600" /> Nothing is sent to anyone until you approve.</p>
          <button onClick={submit} disabled={!canSubmit}
            className="inline-flex items-center gap-1.5 rounded-md bg-accent-600 px-4 py-2 text-sm font-medium text-white shadow-sm transition hover:bg-accent-700 disabled:cursor-not-allowed disabled:opacity-40">
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : null} Create case {!busy && <ArrowRight className="h-4 w-4" />}
          </button>
        </div>
      </div>
    </div>
  );
}
