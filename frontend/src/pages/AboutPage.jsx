const GALLERY_COUNT = 6; // change this number if you add more gallery images

const PBs = [
  { distance: '10,000m', time: '32:44' },
  { distance: '5000m',   time: '15:45' },
  { distance: '3000m',   time: '9:08' },
  { distance: '1500m',   time: '4:11' },
];

function Section({ bgUrl, fallbackGradient, overlay = 'bg-black/55', minH = '', alignBottom = false, children }) {
  return (
    <section className={`relative flex flex-col ${minH}`}>
      <div
        className="absolute inset-0 bg-cover bg-center"
        style={{
          backgroundImage: bgUrl ? `url(${bgUrl}), ${fallbackGradient}` : fallbackGradient,
        }}
      />
      <div className={`absolute inset-0 ${overlay}`} />
      <div className={`relative flex-1 px-5 py-10 text-white flex flex-col ${alignBottom ? 'justify-end' : ''}`}>
        {children}
      </div>
    </section>
  );
}

export default function AboutPage() {
  const galleryImages = Array.from({ length: GALLERY_COUNT }, (_, i) => `/about/gallery/${i + 1}.jpg`);

  return (
    <div className="-mx-4 -my-4 -mb-20">{/* counter-act AppShell padding so sections go edge-to-edge */}
      {/* HERO / ABOUT */}
      <Section
        bgUrl="/about/hero.jpg"
        fallbackGradient="linear-gradient(135deg, #1e3a8a 0%, #1d4ed8 60%, #2563eb 100%)"
      >
        <h1 className="text-3xl font-bold mb-1">Hi, I am Yehonatan</h1>
        <p className="text-sm uppercase tracking-widest opacity-80 mb-6">CS Graduate · Athlete · Coach</p>

        <div className="space-y-3 text-sm leading-relaxed max-w-prose">
          <p>
            Hi, I'm Yehonatan. I am a Computer Science Graduate and a competitive
            middle-distance athlete Living at the intersection of
            engineering and elite athletics, my running career includes competing at the
            national level, capturing the
            Bronze medal at the 2025 Israeli 5K Championships, and competing in the
            Canadian National Cross-Country Championships while on an exchange semester
            at the University of British Columbia (UBC) in Vancouver.
          </p>
          <p>
            This app was born out of personal frustration. As a runner, I noticed a major
            gap in structured athletic support at my university, which drove me to found
            the Hebrew University Running Team (huji_run). I built this platform to bring
            professional-grade training management, automatic performance tracking, and
            community features to our athletes.
          </p>
          <p>
            I designed this app using the exact same principles I value in software
            engineering and on the track: precision, optimization, and relentless consistency.
          </p>
        </div>
      </Section>

      {/* PERSONAL BESTS */}
      <Section
        bgUrl="/about/pb.jpg"
        fallbackGradient="linear-gradient(135deg, #0f172a 0%, #1e293b 70%, #334155 100%)"
        overlay="bg-gradient-to-t from-black/70 via-black/25 to-transparent"
        minH="min-h-[75vh]"
        alignBottom
      >
        <h2 className="text-lg font-bold mb-3">My Personal Bests</h2>
        <div className="space-y-1.5 max-w-xs">
          {PBs.map((pb) => (
            <div
              key={pb.distance}
              className="flex items-center justify-between bg-black/30 backdrop-blur-sm rounded-md px-3 py-1.5 border border-white/15"
            >
              <span className="text-xs font-medium">{pb.distance}</span>
              <span className="font-mono text-sm font-bold">{pb.time}</span>
            </div>
          ))}
        </div>
      </Section>

      {/* GALLERY */}
      <section className="bg-gray-900 py-8">
        <h2 className="text-lg font-bold text-white px-5 mb-4">My Collection</h2>
        <div className="flex gap-3 overflow-x-auto px-5 scrollbar-hide">
          {galleryImages.map((src, i) => (
            <img
              key={src}
              src={src}
              alt={`Gallery ${i + 1}`}
              className="h-48 w-auto rounded-xl object-cover flex-shrink-0 shadow-lg"
              onError={(e) => { e.currentTarget.style.display = 'none'; }}
            />
          ))}
        </div>
      </section>

      {/* CONTACT */}
      <section className="bg-gray-900 px-5 pt-2 pb-32 text-white">
        <div className="border-t border-white/10 pt-6 space-y-3 text-sm">
          <p>
            <span className="opacity-60">Email: </span>
            <a href="mailto:yonzra12@gmail.com" className="font-medium hover:underline">yonzra12@gmail.com</a>
          </p>
          <p>
            <span className="opacity-60">Phone: </span>
            <a href="tel:+972546374390" className="font-medium hover:underline">054-637-4390</a>
          </p>
          <p className="flex items-center gap-2 flex-wrap">
            <span className="opacity-60">LinkedIn:</span>
            <a
              href="https://www.linkedin.com/feed/"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-white/10 border border-white/20 text-xs font-medium hover:bg-white/20 transition"
            >
              Check my LinkedIn
            </a>
          </p>
          <p className="flex items-center gap-2 flex-wrap">
            <span className="opacity-60">GitHub:</span>
            <a
              href="https://github.com/yehonatanEzra"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-white/10 border border-white/20 text-xs font-medium hover:bg-white/20 transition"
            >
              Check my code
            </a>
          </p>
        </div>
      </section>
    </div>
  );
}
