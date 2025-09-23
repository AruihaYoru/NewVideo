# The MRV Project: A Glorious, Useless Endeavor

Welcome, brave developer, to the official repository for the MRV (Maybe Runs Very-slowly) video ecosystem. You've stumbled upon a project that answers a question nobody asked, using technology that's far too powerful for the task at hand.

We took a look at modern, efficient video codecs like H.264 and AV1, and thought, "Nah, we can do worse."

**So we built our own. Because we could.**

![A glorious, pixelated video playing in the custom MRV player, showcasing its limited color palette and blocky charm.](https://i.imgur.com/placeholder.gif "This is probably what it would look like if we bothered to make a demo GIF.")

## The Philosophy: A Symphony of Contradictions

This project is an homage to over-engineering and a testament to the sheer joy of building things for the sake of building them. It is, as one wise observer noted, an "antithesis incarnate."

*   **We use high-level GPU programming (WebGL)**... to render 256-color, pixelated video that looks like it's from 1995.
*   **We wrote a meticulously structured Python encoder**... to create a proprietary, inefficient video format that no other software on Earth can play.
*   **We designed a robust binary specification with I-Frames and P-Frames**... for a format whose primary feature is being a joke.
*   **The code is clean, modular, and well-documented**... while the included `ReadMe,now.txt` is a chaotic mess of self-deprecating humor and HTML tags.

This isn't about creating a better video format. It's about the journey. And maybe melting a few CPUs along the way.

---

## What's in the Box?

This magnificent monument to poor judgment consists of two perfectly complementary parts: The Creator and The Beholder.

### 1. The Encoder (`encoder.py`) 🔧 - The Alchemist's Workshop

This Python script is where the magic (or, more accurately, the *mangling*) happens. It takes your beautiful, vibrant MP4s and lovingly bullies them into the arcane `.mrv` format.

**Features:**
*   **Advanced Color Quantization:** Mercilessly reduces your video's infinite color spectrum to a mere 256 colors.
*   **"Intelligent-ish" Compression:** Uses I-Frames (full picture) and P-Frames (only what changed) to create the illusion of efficiency.
*   **Scene-Change Detection:** Employs histogram comparison to decide when to give up on P-Frames and just send a whole new picture.
*   **Batch Processing:** Because why ruin just one video when you can ruin all of them at once?
*   **Fully Configurable:** Tweak the width, color count, and compression sensitivity to achieve your perfect level of artifacting.

**Requirements:**
You'll need Python and a few libraries. Just run this:
```bash
pip install -r requirements.txt
```
*(Yes, there's a `requirements.txt`. We might be insane, but we're not monsters.)*

**Usage:**

*   **Basic Conversion (Single File):**
    ```bash
    python encoder.py your_video.mp4
    ```

*   **With More Options:** (Set width to 320px and colors to 64)
    ```bash
    python encoder.py your_video.mp4 -o my_masterpiece.mrv -w 320 -c 64
    ```

*   **Batch Mode:** (Convert all `.mp4` files in the directory with custom settings)
    ```bash
    python encoder.py --batch -w 400 -s 0.6
    ```

---

### 2. The Player (`index.html` & `player.js`) 🔮 - The Arcane Viewing Crystal

This is it. The one and only device in the known universe capable of decoding the cryptic `.mrv` format. It's a web-based player that runs entirely in your browser.

**Features:**
*   **High-Performance WebGL Rendering:** Harnesses the awesome power of your GPU to perform the trivial task of looking up colors in a 256-entry table. Peak efficiency.
*   **Full Playback Control:** Play, pause, adjust speed, and seek frame-by-frame. All the features you'd expect from a player for a format you'd never actually use.
*   **Interactive Viewport:** Drag to pan. Scroll to zoom. Rotate the video for no reason at all.
*   **Comprehensive Keyboard Shortcuts:** For the power user who is inexplicably choosing to power-use this.
*   **A Glorious Debug Panel:** Watch in real-time as the player reconstructs P-Frames from a stream of pixel deltas. It's more entertaining than the video itself.

**Dependencies:**
*   `JSZip.min.js` (included in the repo, you don't need to do anything).

**Usage:**

1.  Make sure `index.html`, `jszip.min.js`, and `player.js` are in the same directory.
2.  Open `index.html` in a modern web browser.
3.  Drag and drop your newly created `.mrv` abomination onto the page.
4.  Behold your creation.

---

## The Grand "Why?"

> "The few MRVs produced early on contain texts that are 'very valuable.' What's more: it's now available here!"
>
> — `ReadMe,now.txt`

This project is for the curious. For the learners. For anyone who wants to understand how video compression works at a fundamental level by building a simplified version of it from scratch. It's a portfolio piece that says, "I can write solid, structured code... and I have a sense of humor about it."

Go forth and create something wonderfully, beautifully useless.

**Happy (and questionable) encoding!**
