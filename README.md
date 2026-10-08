# Curio

**Turn your textbook into a personal tutor.**

Give Curio a textbook as a PDF. It turns the book into a clean, readable
version on your computer, with a tutor beside every page that knows the book,
knows what you've already learned, and tells you what to study next.

Curio runs on [Claude Code](https://claude.com/product/claude-code), using
the Claude subscription you already have. There's nothing else to pay for and
no account to make.

## What you get

- **Your book, easy to read.** Every chapter becomes a clean page with the
  author's exact words, properly typeset math, and the book's own figures.
- **A tutor on every page.** Highlight any sentence and ask about it. Answers
  use the book's own examples and section numbers, and say clearly when they
  go beyond the book.
- **Practice questions you can trust.** Questions come from the pages that
  teach each idea, and a second check approves every question before you see
  it, so a wrong answer key never teaches you something false.
- **It remembers what you know.** Curio tracks each idea from "seen it" to
  "solid", and an idea only counts as learned once *you've* explained or
  answered it, not because the tutor explained it well.
- **It tells you what to do next, and why.** A map of how the book's ideas
  depend on each other, reviews timed for just before you'd forget, and an
  optional goal ("finish chapter 5 by Friday") with a daily plan.

Your books and your progress stay on your computer.

## What you need

- A Mac or a Windows PC (Linux works too)
- A paid Claude plan: Pro, Max, Team, or Enterprise
- Your textbook as a PDF

## Set it up (once, about 10 minutes)

You'll type a few things into a **terminal**, your computer's text-command
window. Each step tells you exactly what to type: copy it, paste it, and
press **Enter** (on a Mac, **Return**).

**1. Open a terminal.**
- **Mac:** press **⌘ Command + Space**, type `Terminal`, and press **Return**.
- **Windows:** press the **Windows key**, type `PowerShell`, and click
  **Windows PowerShell**.

**2. Install Claude Code.** Paste the line for your computer and press
**Enter**:

- **Mac:**
  ```
  curl -fsSL https://claude.ai/install.sh | bash
  ```
- **Windows:**
  ```
  irm https://claude.ai/install.ps1 | iex
  ```

It may sit quietly for a minute while it downloads. When it's done, close the
window and open a new one (same as step 1).

**3. Start Claude and sign in.** Type `claude` and press **Enter**. The first
time, a browser window opens so you can sign in with your Claude account.
When you're back in the terminal you'll see a box where you can type. That's
Claude.

**4. Add Curio.** Type each of these into Claude, pressing **Enter** after
each:

```
/plugin marketplace add williamswartz0322-econo/curio-plugin
```

```
/plugin install curio@curio
```

If Claude asks you questions about Curio's settings, the suggested answers are
fine. Just press **Enter**. Then type `/exit`, close the window, open a new
one, and type `claude` again so Curio loads.

**5. Finish setting up.** Type:

```
/curio:setup
```

Claude checks your computer and installs what's missing (it asks first),
builds the reader, and offers to make a shortcut called `curio-study`. Say
yes to its questions. If it installs something, it will ask you to restart
and run `/curio:setup` once more.

**6. Restart with the shortcut.** Type `/exit`, close the window, open a new
one, and type:

```
curio-study
```

The first time, Claude Code shows a warning about a "development channel".
That's the connection between your book window and Claude, a feature so new
it carries a warning label. Choose **"I am using this for local
development"**. From now on, `curio-study` is how you start Curio.

## Add a book

Inside Claude (started with `curio-study`), type `/curio:ingest`, then a
space, then **drag your PDF file into the terminal window** from Finder or
File Explorer (that fills in the file's location) and press **Enter**:

```
/curio:ingest /Users/you/Books/my-textbook.pdf
```

Claude asks which chapters you want. Start with one or two: turning a
chapter into a readable page takes a few minutes and uses part of your Claude
plan's allowance. You can add more chapters any time by running the same
command again.

Once you have two or more chapters, type `/curio:link` and Claude will map
how the book's ideas connect.

## Study

```
/curio:study
```

Your book opens in its own window. Then:

- **Read** using the chapter list on the left.
- **Ask:** highlight any text, then type your question (or pick "Explain this",
  "Give me an example", …) in the panel on the right.
- **Practice:** the Practice tab gives you a question about the idea you know
  least. Write your answer in your own words; you'll get specific feedback.
- **Next up:** what Curio suggests you do now, with the reason.
- **Course map:** every idea in the book, colored by how well you know it.

Keep the terminal open while you study, because that's where the tutor lives. The
green **● Claude Code** in the corner of the book window means everything's
connected.

**Coming back another day:** open a terminal, type `curio-study`, then
`/curio:study`. Reviews that are due show up on the home page.

You can also study right in the terminal: `/curio:practice` quizzes you there,
and `/curio:next` tells you what to work on.

## Questions

**It says "not connected" in the book window.**
Claude Code was started without the shortcut. Type `/exit`, then start it
again with `curio-study`, and run `/curio:study`. (Reading always works, even
when it's not connected.)

**Claude keeps asking me to approve things.**
Run `/curio:setup` again and say yes when it offers to allow Curio's tools.

**Where are my books and progress kept?**
In a folder called `Curio` in your home folder. Nothing is uploaded anywhere
except what Claude reads while helping you, through your own Claude account.
Only use books you have the right to use.

**Does it cost extra?**
No. Curio uses your Claude plan. Adding a book uses the most; studying uses
about as much as any other Claude conversation. To use less, type `/config`
and set **Ingest model** to `haiku` (faster and lighter, slightly less
precise with heavy math), or to `opus` for the most faithful math.

**The book opens in a browser tab instead of its own window.**
Install Google Chrome, Microsoft Edge, or Brave and it opens in its own clean
window. (Windows already has Edge.)

---

Want to see how Curio works inside, or help build it? See
[docs/DEVELOPMENT.md](docs/DEVELOPMENT.md). The ideas behind it are in
[docs/MISSION.md](docs/MISSION.md).
