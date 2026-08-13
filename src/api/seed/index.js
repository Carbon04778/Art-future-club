/**
 * Demo seed data for the mock provider.
 *
 * Shaped to match base44/entities/*.jsonc exactly, so the same records will
 * import cleanly into Supabase later.
 *
 * URLs are written out in full rather than built from a helper, so that
 * scripts/localise-images.mjs can find and rewrite them like every other
 * image reference. Do not refactor these back into a template literal.
 */

const HERO = "/images/AdobeStock_528827486.jpg";
const JULIE = "/images/LandingpageJulieinterveiw.png";
const BANGKOK = "/images/Landingpagebangkokchapter.png";
const MILANO = "/images/LandingpageMalanochapter.jpg";
const TORONTO = "/images/LandingpageTorontochapter.png";
const ZURICH = "/images/LandingpageZurich.jpg";
const GENERATED = "/images/generated_image.png";

const daysFromNow = (n) => {
  const d = new Date();
  d.setDate(d.getDate() + n);
  return d.toISOString();
};
const daysAgo = (n) => daysFromNow(-n);

/* ------------------------------------------------------------------ people */

export const DEMO_USERS = {
  lin: "user_lin",
  tommy: "user_tommy",
  sara: "user_sara",
  amara: "user_amara",
  dario: "user_dario",
  vetiva: "user_vetiva",
  aftermath: "user_aftermath",
  kunsthalle: "user_kunsthalle",
};

const artistProfiles = [
  {
    id: "artist_lin",
    user_id: DEMO_USERS.lin,
    display_name: "Lin Yuk Shan",
    discipline: "Painting",
    based_in: "Hong Kong",
    chapter: "Hong Kong",
    bio: "Lin works in oil and pigment suspension, building surfaces that hold the humidity of the city she paints. Her recent series maps Cantonese shopfront signage onto abstracted vertical fields.",
    website: "https://example.com/linyukshan",
    instagram: "linyukshan",
    avatar_url: GENERATED,
    portfolio_works: [
      {
        title: "Shopfront (Sheung Wan)",
        year: "2025",
        medium: "Oil on linen",
        dimensions: "180 × 140 cm",
        description:
          "The first in a series tracing hand-painted signage before its removal.",
        image_url: HERO,
        additional_images: [],
        available_for_sale: true,
        price: "48,000",
        currency: "HKD",
      },
      {
        title: "Humidity Study IV",
        year: "2024",
        medium: "Pigment suspension on board",
        dimensions: "90 × 90 cm",
        description: "Painted across a single August week without air conditioning.",
        image_url: JULIE,
        additional_images: [],
        available_for_sale: false,
        price: "",
        currency: "HKD",
      },
    ],
    cv: {
      statement:
        "I am interested in what a city forgets on purpose, and in the surfaces that carry that forgetting.",
      exhibitions: [
        { year: "2025", title: "Vertical Fields", venue: "VetiVa, Hong Kong" },
        { year: "2024", title: "Group Show: Nine Painters", venue: "Aftermath, Central" },
      ],
      education: [
        { year: "2019", title: "MFA Fine Art", venue: "Chinese University of Hong Kong" },
      ],
      awards: [{ year: "2025", title: "Emerging Painter Prize", venue: "AFC Hong Kong" }],
    },
    seeking: ["Exhibition Opportunities", "Collectors"],
    open_to_commissions: true,
    is_premium: true,
    is_featured: true,
    featured_until: daysFromNow(20),
    created_date: daysAgo(240),
    updated_date: daysAgo(4),
  },
  {
    id: "artist_tommy",
    user_id: DEMO_USERS.tommy,
    display_name: "Tommy Cheung",
    discipline: "Installation",
    based_in: "Hong Kong",
    chapter: "Hong Kong",
    bio: "Tommy builds light installations for narrow spaces — corridors, stairwells, the gaps between towers.",
    instagram: "tommycheungstudio",
    avatar_url: BANGKOK,
    portfolio_works: [
      {
        title: "Corridor (14th Floor)",
        year: "2025",
        medium: "LED, aluminium, mirror",
        dimensions: "Dimensions variable",
        description: "A corridor that appears to extend past the building envelope.",
        image_url: BANGKOK,
        additional_images: [],
        available_for_sale: false,
        price: "",
        currency: "HKD",
      },
    ],
    cv: {
      statement: "Density is not a problem to solve. It is a material.",
      exhibitions: [{ year: "2025", title: "Narrow Light", venue: "AIA Vitality Hub" }],
      education: [{ year: "2021", title: "BA Spatial Design", venue: "PolyU" }],
      awards: [],
    },
    seeking: ["Collaborators", "Residencies"],
    open_to_commissions: false,
    is_premium: false,
    is_featured: false,
    created_date: daysAgo(180),
    updated_date: daysAgo(12),
  },
  {
    id: "artist_sara",
    user_id: DEMO_USERS.sara,
    display_name: "Sara Wu",
    discipline: "Photography",
    based_in: "Hong Kong",
    chapter: "Hong Kong",
    bio: "Street portraiture concerned with displacement, tenancy and the people who stay.",
    avatar_url: TORONTO,
    portfolio_works: [
      {
        title: "Tenants, Sham Shui Po",
        year: "2024",
        medium: "Archival pigment print",
        dimensions: "60 × 40 cm, ed. 5",
        description: "",
        image_url: TORONTO,
        additional_images: [],
        available_for_sale: true,
        price: "12,000",
        currency: "HKD",
      },
    ],
    cv: { statement: "", exhibitions: [], education: [], awards: [] },
    seeking: ["Press", "Representation"],
    open_to_commissions: true,
    is_premium: false,
    is_featured: false,
    created_date: daysAgo(90),
    updated_date: daysAgo(30),
  },
  {
    id: "artist_amara",
    user_id: DEMO_USERS.amara,
    display_name: "Amara Okonkwo",
    discipline: "Mixed Media",
    based_in: "London",
    chapter: "London",
    bio: "Textile, print and found archive material assembled into wall-scale composites.",
    avatar_url: MILANO,
    portfolio_works: [
      {
        title: "Archive Fold I",
        year: "2025",
        medium: "Textile, screenprint, paper",
        dimensions: "200 × 160 cm",
        description: "",
        image_url: MILANO,
        additional_images: [],
        available_for_sale: true,
        price: "9,500",
        currency: "GBP",
      },
    ],
    cv: { statement: "", exhibitions: [], education: [], awards: [] },
    seeking: ["Exhibition Opportunities"],
    open_to_commissions: true,
    is_premium: true,
    is_featured: true,
    featured_until: daysFromNow(12),
    created_date: daysAgo(150),
    updated_date: daysAgo(6),
  },
  {
    id: "artist_dario",
    user_id: DEMO_USERS.dario,
    display_name: "Dario Ferretti",
    discipline: "Sculpture",
    based_in: "Milano",
    chapter: "Milano",
    bio: "Carved marble and cast resin, working between traditional workshop practice and industrial process.",
    avatar_url: ZURICH,
    portfolio_works: [
      {
        title: "Untitled (Carrara)",
        year: "2024",
        medium: "Marble",
        dimensions: "70 × 40 × 40 cm",
        description: "",
        image_url: ZURICH,
        additional_images: [],
        available_for_sale: true,
        price: "22,000",
        currency: "EUR",
      },
    ],
    cv: { statement: "", exhibitions: [], education: [], awards: [] },
    seeking: ["Collectors", "Representation"],
    open_to_commissions: false,
    is_premium: false,
    is_featured: false,
    created_date: daysAgo(200),
    updated_date: daysAgo(45),
  },
];

const collectorProfiles = [
  {
    id: "gallery_vetiva",
    user_id: DEMO_USERS.vetiva,
    display_name: "VetiVa",
    type: "Gallery",
    partnership_type: "Paid Member",
    based_in: "Hong Kong",
    bio: "An independent gallery on the 19th and 20th floors of K11 Atelier, programming emerging painters from across the Pearl River Delta.",
    website: "https://example.com/vetiva",
    instagram: "vetiva.hk",
    avatar_url: GENERATED,
    cover_image_url: HERO,
    address:
      "19/F & 20/F, K11 Atelier, Victoria Dockside, Tsim Sha Tsui, Hong Kong",
    opening_hours: "Tue–Sat, 11:00–19:00",
    phone: "+852 0000 0000",
    email: "hello@example.com",
    space_images: [
      { url: HERO, caption: "Main room, east wall" },
      { url: JULIE, caption: "Viewing room" },
    ],
    interests: ["Painting", "Photography", "Installation"],
    seeking: ["Emerging Artists", "Gallery Partnerships"],
    geo_placename: "Tsim Sha Tsui",
    geo_region: "Kowloon, Hong Kong",
    geo_lat: 22.2951,
    geo_lng: 114.1717,
    created_date: daysAgo(300),
    updated_date: daysAgo(3),
  },
  {
    id: "gallery_aftermath",
    user_id: DEMO_USERS.aftermath,
    display_name: "Aftermath",
    type: "Gallery",
    partnership_type: "Paid Member",
    based_in: "Hong Kong",
    bio: "Gallery and bar in Central. Shows run late; openings run later.",
    avatar_url: BANGKOK,
    cover_image_url: BANGKOK,
    address: "Central, Hong Kong",
    opening_hours: "Wed–Sun, 16:00–late",
    space_images: [{ url: BANGKOK, caption: "Front room" }],
    interests: ["Painting", "Digital Art"],
    seeking: ["Emerging Artists"],
    geo_placename: "Central",
    geo_region: "Hong Kong Island",
    geo_lat: 22.2819,
    geo_lng: 114.1552,
    created_date: daysAgo(260),
    updated_date: daysAgo(9),
  },
  {
    id: "venue_kunsthalle",
    user_id: DEMO_USERS.kunsthalle,
    display_name: "Zurich Kunstraum",
    type: "Institution",
    based_in: "Zurich",
    bio: "A non-profit exhibition space supporting research-led practice.",
    avatar_url: ZURICH,
    cover_image_url: ZURICH,
    address: "Zurich, Switzerland",
    opening_hours: "Thu–Sun, 12:00–18:00",
    space_images: [{ url: ZURICH, caption: "Upper hall" }],
    interests: ["Installation", "Video Art", "Performance"],
    seeking: ["Established Artists"],
    geo_placename: "Zurich",
    geo_region: "Zurich, Switzerland",
    geo_lat: 47.3769,
    geo_lng: 8.5417,
    created_date: daysAgo(140),
    updated_date: daysAgo(15),
  },
  {
    id: "collector_iris",
    user_id: "user_iris",
    display_name: "Iris Lam",
    type: "Collector",
    based_in: "Hong Kong",
    bio: "Collecting emerging Asian painting since 2018.",
    avatar_url: MILANO,
    interests: ["Painting", "Photography"],
    budget_range: "$5k–$20k",
    seeking: ["Emerging Artists", "Editions"],
    created_date: daysAgo(80),
    updated_date: daysAgo(20),
  },
];

const galleryWorks = [
  {
    id: "gw_1",
    artist_id: DEMO_USERS.vetiva,
    artist_name: "Lin Yuk Shan",
    artist_discipline: "Painting",
    title: "Shopfront (Sheung Wan)",
    year: "2025",
    medium: "Oil on linen",
    dimensions: "180 × 140 cm",
    description: "From the Vertical Fields series.",
    image_url: HERO,
    available_for_sale: true,
    price: "48,000",
    currency: "HKD",
    tags: ["painting", "hong kong"],
    created_date: daysAgo(30),
    updated_date: daysAgo(30),
  },
  {
    id: "gw_2",
    artist_id: DEMO_USERS.vetiva,
    artist_name: "Sara Wu",
    artist_discipline: "Photography",
    title: "Tenants, Sham Shui Po",
    year: "2024",
    medium: "Archival pigment print",
    dimensions: "60 × 40 cm",
    description: "",
    image_url: TORONTO,
    available_for_sale: true,
    price: "12,000",
    currency: "HKD",
    tags: ["photography"],
    created_date: daysAgo(24),
    updated_date: daysAgo(24),
  },
  {
    id: "gw_3",
    artist_id: DEMO_USERS.aftermath,
    artist_name: "Tommy Cheung",
    artist_discipline: "Installation",
    title: "Corridor (14th Floor)",
    year: "2025",
    medium: "LED, aluminium, mirror",
    dimensions: "Variable",
    description: "",
    image_url: BANGKOK,
    available_for_sale: false,
    price: "",
    currency: "HKD",
    tags: ["installation", "light"],
    created_date: daysAgo(14),
    updated_date: daysAgo(14),
  },
  {
    id: "gw_4",
    artist_id: DEMO_USERS.kunsthalle,
    artist_name: "Dario Ferretti",
    artist_discipline: "Sculpture",
    title: "Untitled (Carrara)",
    year: "2024",
    medium: "Marble",
    dimensions: "70 × 40 × 40 cm",
    description: "",
    image_url: ZURICH,
    available_for_sale: true,
    price: "22,000",
    currency: "EUR",
    tags: ["sculpture"],
    created_date: daysAgo(60),
    updated_date: daysAgo(60),
  },
];

const articles = [
  {
    id: "art_julie",
    title: "Julie Chan on painting the city before it disappears",
    subtitle:
      "The Hong Kong painter discusses signage, demolition, and working without air conditioning.",
    body: `Julie Chan has spent four years photographing shopfronts that no longer exist.

"I started because a noodle shop near my studio closed," she says. "The sign had been hand-painted in the sixties. Someone took it down in an afternoon and that was it."

The resulting body of work sits somewhere between documentation and abstraction. Chan enlarges fragments of signage until the characters stop reading as language and start reading as structure — a vertical field of red and gold that could be a wall, a curtain, or a page.

## On process

She works from her own photographs rather than archival material, a decision she describes as "stubborn rather than principled."

The paintings are built in thin layers over several weeks. Chan does not use air conditioning while working, a practice she began by accident during a broken summer and kept.

## On the chapter

Chan joined the Art Future Club Hong Kong chapter in its first year. "It gave me collectors who wanted to talk about the work rather than the price," she says. "That is rarer than it sounds."`,
    author_name: "AFC Editorial",
    category: "Interview",
    categories: ["Interview"],
    tags: ["Hong Kong", "Painting", "Studio Visit"],
    cover_image_url: JULIE,
    cover_image_alt: "Julie Chan in her Hong Kong studio",
    cover_image_caption: "Julie Chan, studio, Sheung Wan.",
    images: [],
    layout: "cover_top",
    slug: "julie-chan-painting-the-city",
    seo_title: "Julie Chan on painting the city before it disappears",
    seo_description:
      "The Hong Kong painter discusses signage, demolition, and working without air conditioning.",
    seo_keywords: "Julie Chan, Hong Kong painting, AFC Editorial",
    geo_placename: "Hong Kong",
    geo_region: "Hong Kong",
    geo_lat: 22.3193,
    geo_lng: 114.1694,
    publish_date: daysAgo(6),
    published: true,
    featured: true,
    reading_time_mins: 6,
    created_date: daysAgo(6),
    updated_date: daysAgo(6),
  },
  {
    id: "art_collecting",
    title: "What collectors actually ask for",
    subtitle: "Five gallerists on the questions that come up before a sale.",
    body: `Ask a gallerist what closes a sale and you will rarely hear "the work."

You hear about condition reports, about framing, about whether the artist has a CV that suggests a fifth year of practice. You hear, repeatedly, about provenance.

## The pattern

Across five conversations with partner galleries in Hong Kong, London and Milano, the same three questions recurred:

- What else has this artist shown, and where?
- Is the edition genuinely closed?
- Who else owns one?

None of these are questions about aesthetics. All of them are questions about risk.

## What it means for artists

The practical implication is unglamorous: keep your CV current, document your exhibitions, and be precise about editions. Galleries are not gatekeeping when they ask. They are answering the question their collector is about to ask them.`,
    author_name: "AFC Editorial",
    category: "Feature",
    categories: ["Feature"],
    tags: ["Collecting", "Galleries", "Advice"],
    cover_image_url: HERO,
    cover_image_alt: "Gallery interior",
    images: [],
    layout: "image_after_intro",
    slug: "what-collectors-actually-ask-for",
    seo_description: "Five gallerists on the questions that come up before a sale.",
    publish_date: daysAgo(20),
    published: true,
    featured: false,
    reading_time_mins: 4,
    created_date: daysAgo(20),
    updated_date: daysAgo(20),
  },
  {
    id: "art_milano",
    title: "Milano chapter: a first year in review",
    subtitle: "Twelve months, nine gatherings, and one very long dinner.",
    body: `The Milano chapter opened with eleven members and a borrowed room.

Twelve months later it runs a monthly critique night, two studio-visit routes, and a collectors' dinner that has developed a reputation for overrunning.

## What worked

Small rooms. Every gathering capped below thirty people, which meant nobody spent the evening on the edge of a conversation.

## What did not

The first attempt at an open call attracted four hundred submissions and no reviewers. The chapter now runs open calls twice a year with a named panel.`,
    author_name: "AFC Editorial",
    category: "News",
    categories: ["News"],
    tags: ["Milano", "Chapters"],
    cover_image_url: MILANO,
    cover_image_alt: "Milano chapter gathering",
    images: [],
    layout: "cover_top",
    slug: "milano-chapter-first-year",
    publish_date: daysAgo(40),
    published: true,
    featured: false,
    reading_time_mins: 3,
    created_date: daysAgo(40),
    updated_date: daysAgo(40),
  },
  {
    id: "art_draft",
    title: "Draft: notes on the 2027 programme",
    subtitle: "Not yet published.",
    body: "Internal draft. Visible to admins only.",
    author_name: "AFC Editorial",
    category: "Essay",
    categories: [],
    tags: [],
    images: [],
    layout: "cover_top",
    slug: "draft-2027-programme",
    published: false,
    featured: false,
    created_date: daysAgo(2),
    updated_date: daysAgo(2),
  },
];

const events = [
  {
    id: "ev_basel",
    title: "Art Basel Week — Members Preview",
    description:
      "A curated members-only preview route through Art Basel Hong Kong satellite fairs and off-fair highlights.",
    event_type: "Exhibition",
    chapter: "Hong Kong",
    venue: "Central, Hong Kong",
    address: "Central, Hong Kong",
    start_date: daysFromNow(9),
    end_date: daysFromNow(11),
    image_url: HERO,
    organizer_id: DEMO_USERS.vetiva,
    organizer_name: "VetiVa",
    is_free: false,
    ticket_price: "HK$120",
    created_date: daysAgo(18),
    updated_date: daysAgo(18),
  },
  {
    id: "ev_studio",
    title: "Studio Visits: Sham Shui Po",
    description:
      "Guided visits to three working artists' studios in Hong Kong's most creatively charged neighbourhood.",
    event_type: "Talk",
    chapter: "Hong Kong",
    venue: "Sham Shui Po",
    address: "Sham Shui Po, Kowloon",
    start_date: daysFromNow(22),
    image_url: TORONTO,
    organizer_id: DEMO_USERS.vetiva,
    organizer_name: "VetiVa",
    is_free: true,
    created_date: daysAgo(12),
    updated_date: daysAgo(12),
  },
  {
    id: "ev_london",
    title: "London Chapter: Critique Evening",
    description: "Members bring one work in progress. Ninety minutes, no phones.",
    event_type: "Workshop",
    chapter: "London",
    venue: "Hackney, London",
    address: "Hackney, London",
    start_date: daysFromNow(15),
    image_url: MILANO,
    organizer_name: "AFC London",
    is_free: true,
    created_date: daysAgo(8),
    updated_date: daysAgo(8),
  },
  {
    id: "ev_zurich",
    title: "Opening: Research Room",
    description: "Opening reception for the winter programme.",
    event_type: "Opening",
    chapter: "Zurich",
    venue: "Zurich Kunstraum",
    address: "Zurich, Switzerland",
    start_date: daysFromNow(34),
    image_url: ZURICH,
    organizer_id: DEMO_USERS.kunsthalle,
    organizer_name: "Zurich Kunstraum",
    is_free: true,
    created_date: daysAgo(5),
    updated_date: daysAgo(5),
  },
  {
    id: "ev_past",
    title: "Collectors Dinner",
    description: "Seated dinner bringing together collectors, advisors and two galleries.",
    event_type: "Social",
    chapter: "Hong Kong",
    venue: "Sheung Wan",
    address: "Sheung Wan, Hong Kong",
    start_date: daysAgo(25),
    image_url: JULIE,
    organizer_name: "AFC Hong Kong",
    is_free: false,
    ticket_price: "HK$450",
    created_date: daysAgo(60),
    updated_date: daysAgo(60),
  },
];

const openCalls = [
  {
    id: "oc_residency",
    title: "Pearl River Residency 2027",
    description:
      "A three-month residency for painters and printmakers, including studio, materials budget and a closing exhibition.",
    type: "Residency",
    organizer: "AFC Hong Kong",
    location: "Hong Kong",
    deadline: daysFromNow(45).slice(0, 10),
    fee: "",
    is_free: true,
    prize: "Studio + HK$40,000 materials budget",
    external_link: "https://example.com/residency",
    image_url: HERO,
    disciplines: ["Painting", "Printmaking"],
    posted_by_name: "AFC Editorial",
    created_date: daysAgo(10),
    updated_date: daysAgo(10),
  },
  {
    id: "oc_prize",
    title: "Emerging Sculpture Prize",
    description: "Open to sculptors within eight years of graduation.",
    type: "Competition",
    organizer: "Zurich Kunstraum",
    location: "Zurich",
    deadline: daysFromNow(70).slice(0, 10),
    fee: "CHF 25",
    is_free: false,
    prize: "CHF 8,000 and a solo presentation",
    external_link: "https://example.com/prize",
    image_url: ZURICH,
    disciplines: ["Sculpture", "Installation"],
    posted_by_name: "Zurich Kunstraum",
    created_date: daysAgo(21),
    updated_date: daysAgo(21),
  },
  {
    id: "oc_group",
    title: "Group Show: Vertical Cities",
    description: "Seeking works responding to density, height and urban compression.",
    type: "Exhibition",
    organizer: "Aftermath",
    location: "Hong Kong",
    deadline: daysFromNow(18).slice(0, 10),
    is_free: true,
    external_link: "https://example.com/vertical",
    image_url: BANGKOK,
    disciplines: ["Photography", "Installation", "Painting"],
    posted_by_name: "Aftermath",
    created_date: daysAgo(4),
    updated_date: daysAgo(4),
  },
];

const forumPosts = [
  {
    id: "fp_shipping",
    author_id: DEMO_USERS.sara,
    author_name: "Sara Wu",
    author_discipline: "Photography",
    author_chapter: "Hong Kong",
    title: "Best way to ship framed prints from HK to London?",
    body: "I have a two-print commission going to a collector in London and the framing is already done. Has anyone found a courier that handles glass properly without the cost tripling? Open to swapping to acrylic if that is the sensible answer.",
    category: "Advice",
    reply_count: 2,
    created_date: daysAgo(3),
    updated_date: daysAgo(3),
  },
  {
    id: "fp_critique",
    author_id: DEMO_USERS.tommy,
    author_name: "Tommy Cheung",
    author_discipline: "Installation",
    author_chapter: "Hong Kong",
    title: "Critique request: corridor piece, second iteration",
    body: "Second version of the corridor installation. I have moved the mirror from the end wall to the ceiling and I am not sure it is better. Would value blunt feedback before it goes up in September.",
    category: "Critique Request",
    image_url: BANGKOK,
    reply_count: 1,
    created_date: daysAgo(7),
    updated_date: daysAgo(7),
  },
  {
    id: "fp_collab",
    author_id: DEMO_USERS.amara,
    author_name: "Amara Okonkwo",
    author_discipline: "Mixed Media",
    author_chapter: "London",
    title: "Looking for a printmaker for a collaborative edition",
    body: "London based. Planning an edition of twelve combining screenprint with textile. Happy to split costs and credit equally.",
    category: "Collaboration",
    reply_count: 0,
    created_date: daysAgo(11),
    updated_date: daysAgo(11),
  },
];

const forumReplies = [
  {
    id: "fr_1",
    post_id: "fp_shipping",
    author_id: DEMO_USERS.lin,
    author_name: "Lin Yuk Shan",
    author_discipline: "Painting",
    body: "Swap to acrylic. I lost a piece to glass in transit two years ago and the insurance argument took longer than the shipping.",
    created_date: daysAgo(3),
    updated_date: daysAgo(3),
  },
  {
    id: "fr_2",
    post_id: "fp_shipping",
    author_id: DEMO_USERS.vetiva,
    author_name: "VetiVa",
    author_discipline: "",
    body: "We use a specialist fine art shipper for anything framed. Happy to share the contact — message me.",
    created_date: daysAgo(2),
    updated_date: daysAgo(2),
  },
  {
    id: "fr_3",
    post_id: "fp_critique",
    author_id: DEMO_USERS.amara,
    author_name: "Amara Okonkwo",
    author_discipline: "Mixed Media",
    body: "The ceiling placement reads as more deliberate to me, but the entry point now feels unresolved. What happens in the first two metres?",
    created_date: daysAgo(6),
    updated_date: daysAgo(6),
  },
];

const likes = [
  { id: "lk_1", user_id: DEMO_USERS.sara, target_id: "artist_lin", target_type: "artist_profile", created_date: daysAgo(5), updated_date: daysAgo(5) },
  { id: "lk_2", user_id: DEMO_USERS.tommy, target_id: "artist_lin", target_type: "artist_profile", created_date: daysAgo(4), updated_date: daysAgo(4) },
  { id: "lk_3", user_id: DEMO_USERS.amara, target_id: "artist_lin", target_type: "artist_profile", created_date: daysAgo(2), updated_date: daysAgo(2) },
  { id: "lk_4", user_id: DEMO_USERS.lin, target_id: "artist_amara", target_type: "artist_profile", created_date: daysAgo(3), updated_date: daysAgo(3) },
  { id: "lk_5", user_id: DEMO_USERS.sara, target_id: "artist_amara", target_type: "artist_profile", created_date: daysAgo(1), updated_date: daysAgo(1) },
  { id: "lk_6", user_id: DEMO_USERS.lin, target_id: "gw_3", target_type: "gallery_work", created_date: daysAgo(6), updated_date: daysAgo(6) },
  { id: "lk_7", user_id: DEMO_USERS.dario, target_id: "gw_1", target_type: "gallery_work", created_date: daysAgo(8), updated_date: daysAgo(8) },
  { id: "lk_8", user_id: DEMO_USERS.tommy, target_id: "gw_1", target_type: "gallery_work", created_date: daysAgo(7), updated_date: daysAgo(7) },
];

const follows = [
  { id: "fo_1", follower_id: DEMO_USERS.sara, following_id: DEMO_USERS.lin, following_name: "Lin Yuk Shan", created_date: daysAgo(30), updated_date: daysAgo(30) },
  { id: "fo_2", follower_id: DEMO_USERS.tommy, following_id: DEMO_USERS.lin, following_name: "Lin Yuk Shan", created_date: daysAgo(25), updated_date: daysAgo(25) },
];

const comments = [
  {
    id: "cm_1",
    user_id: DEMO_USERS.tommy,
    user_name: "Tommy Cheung",
    target_id: "artist_lin",
    target_type: "artist_profile",
    body: "Saw these in person at the K11 show. The scale does something the photographs cannot.",
    created_date: daysAgo(9),
    updated_date: daysAgo(9),
  },
];

const inquiries = [
  {
    id: "iq_1",
    artist_id: "artist_lin",
    artist_name: "Lin Yuk Shan",
    work_title: "Shopfront (Sheung Wan)",
    work_image_url: HERO,
    price: "48,000",
    currency: "HKD",
    buyer_name: "Iris Lam",
    buyer_email: "iris@example.com",
    message:
      "Interested in this piece for a Hong Kong apartment. Could you confirm framing and whether it can ship in October?",
    status: "new",
    type: "purchase",
    created_date: daysAgo(2),
    updated_date: daysAgo(2),
  },
  {
    id: "iq_2",
    artist_id: "artist_amara",
    artist_name: "Amara Okonkwo",
    work_title: "Archive Fold I",
    price: "9,500",
    currency: "GBP",
    buyer_name: "Peter Aldridge",
    buyer_email: "peter@example.com",
    message: "Would you consider a commission at a smaller scale?",
    status: "replied",
    type: "commission",
    created_date: daysAgo(16),
    updated_date: daysAgo(14),
  },
];

const subscriptions = [
  {
    id: "sub_1",
    user_id: DEMO_USERS.lin,
    plan: "premium_portfolio",
    status: "active",
    stripe_session_id: "cs_demo_1",
    stripe_customer_id: "cus_demo_1",
    expires_at: daysFromNow(300),
    created_date: daysAgo(65),
    updated_date: daysAgo(65),
  },
  {
    id: "sub_2",
    user_id: DEMO_USERS.amara,
    plan: "featured_listing",
    status: "active",
    stripe_session_id: "cs_demo_2",
    expires_at: daysFromNow(12),
    created_date: daysAgo(18),
    updated_date: daysAgo(18),
  },
];

const notifications = [
  {
    id: "nt_1",
    user_id: DEMO_USERS.lin,
    type: "inquiry",
    from_user_name: "Iris Lam",
    message: "Iris Lam enquired about Shopfront (Sheung Wan)",
    link: "/artists/artist_lin",
    read: false,
    created_date: daysAgo(2),
    updated_date: daysAgo(2),
  },
  {
    id: "nt_2",
    user_id: DEMO_USERS.lin,
    type: "follow",
    from_user_name: "Sara Wu",
    message: "Sara Wu started following you",
    link: "/artists/artist_sara",
    read: true,
    created_date: daysAgo(30),
    updated_date: daysAgo(30),
  },
];

const messages = [
  {
    id: "ms_1",
    sender_id: DEMO_USERS.sara,
    sender_name: "Sara Wu",
    recipient_id: DEMO_USERS.lin,
    recipient_name: "Lin Yuk Shan",
    body: "Are you showing anything at the September group show?",
    read: true,
    created_date: daysAgo(4),
    updated_date: daysAgo(4),
  },
  {
    id: "ms_2",
    sender_id: DEMO_USERS.lin,
    sender_name: "Lin Yuk Shan",
    recipient_id: DEMO_USERS.sara,
    recipient_name: "Sara Wu",
    body: "Two of the smaller works. Come to the opening — I will put you on the list.",
    read: true,
    created_date: daysAgo(4),
    updated_date: daysAgo(4),
  },
];

const collectedWorks = [
  {
    id: "cw_1",
    user_id: "user_iris",
    collector_profile_id: "collector_iris",
    artist_id: "artist_lin",
    artist_name: "Lin Yuk Shan",
    work_ref: "artist_lin::0",
    work_title: "Shopfront (Sheung Wan)",
    work_image_url: HERO,
    work_medium: "Oil on linen",
    work_dimensions: "180 × 140 cm",
    work_year: "2025",
    work_price: "48,000",
    work_currency: "HKD",
    created_date: daysAgo(12),
    updated_date: daysAgo(12),
  },
];

const newsletterSubscribers = [
  {
    id: "ns_1",
    email: "demo@example.com",
    consent: true,
    source: "article",
    created_date: daysAgo(11),
    updated_date: daysAgo(11),
  },
];

export const SEED = {
  Article: articles,
  ArtistProfile: artistProfiles,
  CollectedWork: collectedWorks,
  CollectorProfile: collectorProfiles,
  Comment: comments,
  Event: events,
  Follow: follows,
  ForumPost: forumPosts,
  ForumReply: forumReplies,
  GalleryWork: galleryWorks,
  Inquiry: inquiries,
  Like: likes,
  Message: messages,
  NewsletterSubscriber: newsletterSubscribers,
  Notification: notifications,
  OpenCall: openCalls,
  Subscription: subscriptions,
};
