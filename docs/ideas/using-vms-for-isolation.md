# Using VMs for isolation

At the moment I'm just using Docker for isolation, and I'm running this on my own laptop, with my own projects. I don't plan on opening up this tool for other people to use, but one thing I would like to be able to do give the LLMs access to Docker, and I'd like to completely prevent them from stepping on each others toes. It would also be nice to be able to easily save the VM's filesystem state so that a human can jump in to the environment if necessary. I suspect that properly setting up a VM would be a bit more difficult than my current docker-based approach, but I don't know that for sure.

This is a pretty low priority, while it will open up some interesting use cases when it comes to agents verifying their own work, there's not *that* much more it unlocks for me beyond what Docker is currently providing.
