---
id: engineers
title: Architecture where you work
audience: Engineers
---

## intro
> title: Architecture where you work | for engineering teams

Architecture documentation usually lives far from the code, so it goes stale. Atrium meets you
where you work: in your repository, your pipeline and your terminal.

## home
> shot: engineer-home

Your home page shows your team's services, their health, and what needs attention: an
end-of-life runtime, a missing owner, a suggestion waiting for you. Services your team owns, you
can edit directly.

## yaml
> code: atrium-yaml

Each repository can describe itself in a small atrium.yaml file. You don't write it from
scratch: one command, atrium init, reads your package files, Dockerfile and compose files and
fills in the runtime, frameworks, databases and dependencies.

## check
> terminal: check

Atrium check compares that against your organisation's standards and technology radar, and
against end-of-life dates. It fails the build only for real problems, and explains each one in
plain words.

## sync
> terminal: sync

In your pipeline, atrium sync keeps the model in step with the code. Changes to services your
team owns are applied straight away. Anything else becomes a suggestion for an architect.

## context
> code: architecture-md

Atrium context writes an ARCHITECTURE.md for your service: what it supports, what it depends on,
who uses it, and the standards that apply. It is always generated from the live model, so it
is never out of date.

## api
> code: api

Everything you see is also available through a documented REST API, and webhooks tell your
other tools the moment something changes. Build on it however you like.

## close
> end: Less documentation work. Better documentation.

Describe your service once, let the pipeline keep it current, and get guidance before you
merge. Less documentation work, better documentation.
