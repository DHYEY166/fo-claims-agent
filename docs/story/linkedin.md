# LinkedIn post (draft for Dhyey to post)

When: Mon Oct 19, right after the X quote-repost is live (about 1:15 PM ET / 10:15 AM PT). Upload the same video natively instead of linking X, and put the X link in the first comment so the post itself isn't penalized for an outside link.

Replace `[REPO]` and `[X LINK]` before posting.

## Post

```
Getting charged twice for the same order is annoying. Getting the money back is worse: find the receipt, figure out who to contact, write the email, watch the deadline, chase the reply. A lot of people just let it go.

This weekend I built an agent for the Wajo GSD hackathon that does that work for you. It's built on Fo, Wajo's action agent, with Claude.

Here's how it works:

1. You paste the email or describe what happened.
2. Claude turns it into a case: a card dispute, insurance claim or package claim, with the amount, merchant, date and order number. Every field cites the line it came from, the filing deadline is computed in code, and card numbers are masked before anything is stored.
3. You see exactly who Fo will email, what it will say and what it costs. Nothing goes out until you click Approve.
4. Fo sends the email. The agent marks it sent only when Fo confirms it, and if the bank doesn't answer, it flags the case for you. Any follow-up needs your approval again.

The part I cared about most was trust. A vague claim, an email address nothing in the claim explains, or a request to move money sends the case to a person instead. Approving twice still sends one email. Every outbound action, plus the follow-up, the reply and the resolution, goes into an audit log where each entry is chained to the one before it.

The video shows one real email sent through Fo to a test inbox, using test data. Real sends are capped at 3 a day in code, and 71 automated tests pass in CI.

Code: [REPO]

Voting is open until Friday, and community likes count for half the score. If this is useful to you, a like or a repost of the X post would mean a lot. Link in the comments.

#AI #Agents #Hackathon #Claude
```

## First comment

```
Vote with a like on X: [X LINK]
```

## Notes

- Uses only what the team built and ran. No user numbers, no money recovered, no phone calls.
- If the live take ends HELD or UNCONFIRMED instead of sent, change the "one real email sent" sentence to match the video.
- Update the test count if feature/trust-tests merges first.
