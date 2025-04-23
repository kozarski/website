---
title: Introduction
date: '2025-04-22'
tags: [self, blog]
description: Why this blog exists, a peek behind the site, and an invitation to share.
permalink: posts/{{ title | slug }}/index.html
---

Hello there! Welcome to the little blog corner of my website. You might be wondering... "Why a blog? Why are you not on Medium, Design Twitter, or Instagram?"

It's a fair question.

### Blog? Really?

Well, for starters, I'm not really on traditional social media (does browsing YouTube count? Debatable). While I appreciate the connections that *may* come along with all the various social platforms, I generally enjoy quiet spaces – ones that I own and shape – to share what I'm working on, mull over ideas, get thoughts out of my head, and yes, give friends who might miss my online presence a way to see what's been occupying my mind. My stance on this may change one day, but for now, here I am.

It's less about broadcasting and more about... well, *documenting* and *sharing* the process.

### Pffff. Showoff! (finally)

Up until now, I've been awful at sharing my work online. While it's not necessarily true that I've shared *nothing* before this blog - I've generally accomplished this asynchronously and organically with my friends when we chat. This is most likely a byproduct of me not already socializing online, and ultimately not having a dedicated platform to engage more often with others. This is the past, however, as I plan to slowly change this habit with the space I've created to call home.

This brings me to a popular little book you might already know (or own), which gave me a nudge:

> "The beauty of owning your own turf is that you can do whatever you want with it. Your domain name is your domain. You don't have to make compromises. Build a good domain name, keep it clean, and eventually it will be its own currency. Whether people show up or they don't, you're out there, doing your thing, ready whenever they are."
> — Austin Kleon, [*Show Your Work!*](https://austinkleon.com/show-your-work/)

Reading (and re-reading) Austin Kleon's words reminded me that hoarding ideas or keeping processes private isn't just missed opportunity, it's maybe even a little selfish. I wish I could sit here and say this was a new book (it wasn't), or that this was the first time I heard this (it's not). I've learned so much from seeing how others create, stumble, and figure things out online, so it's my time to return the favors, however small the scale.

So, in many ways, this blog is also a challenge to myself: **Share more. Document the journey. Show the work.** Expect a mix of side projects, design explorations, tech banter, maybe some photos, and whatever else I have going on.

### Blog FAQ

#### Since this is the first "real" post and the blog's launch, here are a few details about the site itself:
####
* The main body text is set in [IBM Plex Sans](https://www.ibm.com/plex/).
* This site is built with the awesomely simple static site generator [Eleventy (11ty)](https://www.11ty.dev/).
* What color is that green? It's `#CBFF12`.
* What color is the background? It's `#FFFFFE` (similar to `#FFFFFF`).
* How did you make that little hover squiggle effect for links?
    ```css
    /* CSS for the squiggle effect on "read post" links */
    .read-more-text {
      position: relative; /* Needed for absolute positioning of SVG */
      display: inline-block;
      padding-bottom: 10px; /* Space for the squiggle */
    }

    .squiggle-svg {
      position: absolute;
      bottom: 0;
      left: 0;
      width: 100%;
      height: 9px;
      pointer-events: none; /* So it doesn't interfere with link click */
    }

    .squiggle-svg path {
      /* Assumes pathLength="1" is set on the SVG path element */
      stroke-dasharray: 1; 
      stroke-dashoffset: 1;
      /* Define the non-hover transition */
      transition: stroke-dashoffset 0.6s cubic-bezier(0.7, 0, 0.3, 1);
    }

    /* Animate the squiggle on hover */
    .post-list__read-more:hover .squiggle-svg path {
      stroke-dashoffset: 0;
      /* Define the hover transition */
      transition-timing-function: cubic-bezier(0.8, 1, 0.7, 1);
      transition-duration: 0.3s;
    }
    ```
* How often are you going to post? Once a month (at minimum) to start.
* How do you have a FAQ already if the site just launched? ʕ •ᴥ•ʔ

### More to come

That's the plan, anyway. Thanks for stopping by. Feel free to [reach out](/about) if you have anything you want to connect about.

Stay curious!