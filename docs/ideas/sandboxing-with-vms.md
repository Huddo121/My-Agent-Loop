# Sandboxing with VMs (Archived)

> **Status**: This idea has been implemented. See [Firecracker VM Sandboxing Decision](../decisions/firecracker-vm-sandboxing.md) for the full architectural specification.

---

_Archived notes from initial exploration:_

At the moment I'm using Docker for the sandboxing, because it's convenient and in many ways good enough. There's some things I think I might like to do that would not be easy to do well with docker.

## Giving agents access to Docker

I'd like to be able to give agents access to Docker in order for them to be able to spin up things like Postgres containers for their own testing, without multiple agents stepping on each others toes or polluting each other's states over time (e.g. by mounting the same volume for the Postgres container and pushing some garbage schema to Postgres).

## Running and exposing ports for the Agent's work

[This demo](https://www.youtube.com/watch?v=BOMTY2kXksE) of an OpenCode plugin that spins up agent containers on Daytona has a really neat feature that I've been thinking about, where an Agent working on a web service should run the service and I should be able to connect to it to verify its work. Branch deploys are super useful, but being able to give an agent live feedback by actually clicking around in the app it's building would be awesome. I can do this with docker, but again, I worry about conflicts between agents and I'm not sure I can expose new ports for a container while it's running.

## Freezing an agent's workspace

It's pretty easy to freeze the state of a virtual machine, or even just its file system. Being able to sleep an agent if it needs human help (something I think might be interesting, or possibly annoying, I dunno) without it having to sit around actively waiting might be useful. Especially if I can detect this situation, wait some time, then sleep that agent and switch to a new one instead in order to progress through the task queue. It might also be interesting to think about forking an agent run, much like some AI chat apps can do. If an agent gets to a point where there are multiple paths forward, trying all of the paths might be fruitful.

# Resources

- https://www.luiscardoso.dev/blog/sandboxes-for-ai
- https://www.shayon.dev/post/2026/52/lets-discuss-sandbox-isolation/
  - I was starting to consider gVisor based on this and the previous blog post, but this blog mentioned a feature that I really want, and it makes sense that it's not in gVisor:
    > Snapshotting is a feature worth noting. You can capture a running VM’s state including CPU registers, memory, and devices, and restore it later. This enables warm pools where you boot a VM once, install dependencies, snapshot it, and restore clones in milliseconds instead of booting fresh each time. This is how some platforms achieve incredibly fast cold starts even with full VM isolation.
