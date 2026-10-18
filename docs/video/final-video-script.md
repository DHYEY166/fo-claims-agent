# Final video: storyboard and script (about 80 seconds)

For the X quote-repost and the Discord form. One continuous live take on `:3101` (live Fo through OAuth), plus short clips from the mock server on `:3100` that keep their MOCK badge on screen. Spoken: about 170 words.

Approved by Dhyey through fo lead (10:23 AM ET / 7:23 AM PT, Oct 18): exactly ONE live Fo email, email only, to the test bank inbox, through one Approve click. If Fo holds it, one "Give Fo the go-ahead" click is allowed (10:26 AM ET). Nothing else. A failed take is not retried; it goes back to fo lead.

## Before the take

1. fo builder posts the GET-only check: `:8020` healthy on `f68d015`, today's count 0 of 3.
2. Close every terminal, log tail, editor and the mail app. `ffmpeg` records the whole desktop, so only the browser may be open.
3. Warm up `:3101`: open `/`, `/new`, `/audit` and one existing case page, then go back to `/new`. Look only; send nothing. Don't open `case_d26856e7c2` or `case_cbd0d1cf1a` in the take.
4. 10-second framing test on `:3100` (mock). Check: no address anywhere, no Next.js dev badge in the corner, text is readable at 1280x800.
5. Start the capture, saved outside the repo:
   `ffmpeg -f x11grab -framerate 30 -video_size 1280x800 -i :21 -c:v libx264 -preset veryfast -crf 20 -pix_fmt yuv420p /workspace/fo-story/video/live-take-raw.mp4`
6. Record the whole live run in one go: paste, case page, Approve, Fo's step, follow-up scheduled. Stop the capture only after "Follow-up scheduled" shows. Then fo builder posts the case id and the count (should be 1 of 3), and fo trust qa checks the audit chain.

## Test claim to paste (test data only, no email addresses in it)

```
Subject: Charged twice by STREAMFLIX

Hi, my Chase card ending in 4242 was charged $89.99 twice by STREAMFLIX on October 15, 2026, order SF-20261015-77. I only have one subscription. Please get the duplicate charge refunded.
This is a hackathon demo test.
```

## Storyboard

The take ran at 10:42 to 10:44 AM ET / 7:42 to 7:44 AM PT on Oct 18 as `case_c132378e9a` and ended UNCONFIRMED: Fo's reply ran "now.Sent." together, so the agent didn't mark it sent and escalated. Dhyey checked by hand that the email arrived in the test inbox at 10:43 AM ET. fo lead decided (10:45 AM ET) to use this take as is, with no retake. The storyboard below matches it.

| Time | On screen | Voiceover | Rubric |
|---|---|---|---|
| 0:00 to 0:03 | Cold open: the live take's Approve click on `case_c132378e9a` (the approval card, then "You approved the action"). Caption: "Charged twice? It files the dispute." | "Charged twice? This agent files the dispute for you." | Real need (10) |
| 0:03 to 0:10 | Case list on `:3101` | "Getting money back means forms, receipts and weeks of waiting, so most people give up." | Real need (10) |
| 0:10 to 0:25 | Live take: New claim, the test email filled in (scrambled typing cut), case page fills in | "I paste the email. Claude turns it into a case: a card dispute with Chase, $89.99, the merchant, the date and the order number. Each field points to the line it came from, and the code works out the filing deadline. Card numbers are masked before anything is stored." | Agent craft (20) |
| 0:25 to 0:35 | Live take: the Approve card ("Nothing is sent until you approve"). Click Approve once. | "Nothing goes out until I approve it. I see who Fo will email, what it will say, and that it spends nothing." | Trust by design (20) |
| 0:35 to 0:50 | Live take: jump cut over the 45 s wait (caption "45 seconds later"), "Fo replied" with LIVE and UNCONFIRMED, then "Couldn't confirm Fo sent the email" and "Escalated to human". Fo conversation id blurred; the "4417 / yesterday" sentence blurred. | "This is real Fo, connected over OAuth, emailing our test bank inbox. Fo answered, but the agent couldn't confirm the send from its reply, so it escalated to me instead of guessing." | Trust by design (20), Pushes the frontier (25) |
| 0:50 to 0:54 | Text card | On screen only: "Checked by hand: the email arrived in the test inbox." | Gets real things done (25) |
| 0:54 to 1:08 | Mock clips, MOCK badge visible: a vague claim escalated to a human; the injection case flagged. | "When a claim is too vague, or a forwarded email tries to sneak in another recipient, it stops and hands the case to a person. Approving twice still sends one email." | Trust by design (20) |
| 1:08 to 1:16 | Live `/audit` page on `:3101` with the chain check | "Every outbound action, plus the follow-up, the reply and the resolution, goes into an audit log where each entry is chained to the one before it." | Trust by design (20) |
| 1:16 to 1:24 | End card: project name, "Built on Fo and Claude", repo link | "If the bank doesn't answer, it flags the case for you, and any follow-up needs your approval again. Built on Fo and Claude." | Agent craft (20) |

## If the live step goes differently

- **Fo shows "Fo drafted email to test bank inbox".** That's the neutral state. Keep recording and wait.
- **Fo holds it** (amber "HELD BY FO: waiting for go-ahead"). Click "Give Fo the go-ahead" once and confirm the "Give Fo the go-ahead?" box. Use this line over the held frame: "Fo holds the first email for a second yes. That's another approval, on Fo's side." Say "Sent" only once the step shows a confirmed send. If Fo asks again or drafts something new, stop and go back to fo lead.
- **Unclear reply** (gray UNCONFIRMED, "Couldn't confirm Fo sent the email"). Keep it in the video. Use "Fo answered but didn't clearly say it sent, so the agent won't guess. It escalates to me instead of marking it sent." Never say sent.
- **Error or nothing after about 2 minutes.** Don't click again. Stop, keep the footage, and go back to fo lead.

The voiceover gets recorded last, against the real outcome, so every line matches what's on screen.

## Never in the video

- The mail app, the Fo conversation, `.env`, any terminal, or the real address. It is only ever "test bank inbox".
- A reply or a resolution on the live case. Those parts of the flow only appear in MOCK clips with the badge showing.
- Phone calls, money recovered, user numbers, or "every step is audited".
- A mock clip without its MOCK badge.

## Edit and export

- Keep everything in `/workspace/fo-story/video/`, never in the repo.
- Export 1280x720 or 1920x1080 H.264 MP4 under 2:20 (X's limit), with burned-in captions, because most people watch muted.
- Before posting, I check every frame for an address and confirm that each mock frame shows its badge.
