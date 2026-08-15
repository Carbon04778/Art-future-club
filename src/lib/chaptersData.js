/**
 * NOTE ON `venues` AND `gatherings`
 *
 * Both are now empty and are no longer displayed anywhere. Venues and events
 * are read from the database and filtered by chapter, so that the club can add
 * and remove them without a developer, and so a partner that has left is not
 * still advertised on the site.
 *
 * The keys are kept so that any older code reading them does not break.
 * Do not repopulate these — anything added here will not appear.
 */
export const CHAPTERS = [
  {
    city: "Hong Kong",
    slug: "hong-kong",
    chapter: "Ch.01",
    coords: "22.3193°N / 114.1694°E",
    timezone: "HKT+8",
    pulse: "7 active exhibitions · 29°C humid",
    image: "/images/Screenshot2026-08-05at82845pm.png",
    image_credit: "Artwork by: Richard Crosbie",
    signature: "indent-left",
    tagline: "East meets West in a city that never stops moving.",
    about:
      "The Hong Kong chapter sits at the crossroads of Asia's most dynamic art market and its most restless creative underground. From the white cubes of Central to the studios tucked above Sham Shui Po, we convene artists, collectors and curators navigating the tension between commercial ambition and radical practice.",
    gatherings: [],
    artists: [
      { name: "Lin Yuk Shan", discipline: "Painting", focus: "Cantonese identity and urban memory" },
      { name: "Tommy Cheung", discipline: "Installation", focus: "Light, density and vertical space" },
      { name: "Sara Wu", discipline: "Photography", focus: "Street portraiture and displacement" },
    ],
    venues: [],
  },
  {
    city: "London",
    slug: "london",
    chapter: "Ch.02",
    coords: "51.5074°N / 0.1278°W",
    timezone: "GMT+1",
    pulse: "6 active exhibitions · 14°C overcast",
    image: "/images/Screenshot2026-08-05at83456pm.png",
    image_credit: "Artwork by: PJ Riley",
    signature: "indent-left",
    tagline: "Where institutional heritage meets radical experiment.",
    about:
      "The London chapter operates at the intersection of the city's deep museum culture and its volatile, emergent gallery scene. We convene monthly at historic and unconventional venues across Bermondsey, Hackney and the South Bank, hosting salon-style gatherings, studio visits and co-produced exhibitions.",
    gatherings: [],
    artists: [
      { name: "Idris Olu", discipline: "Sculpture", focus: "Reclaimed steel and urban memory" },
      { name: "Petra Sinclair", discipline: "Painting", focus: "Abstract surface and domestic space" },
      { name: "James Acheampong", discipline: "Photography", focus: "Documentary portraiture" },
    ],
    venues: [],
  },
  {
    city: "New York",
    slug: "new-york",
    chapter: "Ch.03",
    coords: "40.7128°N / 74.0060°W",
    timezone: "EST-5",
    pulse: "8 active exhibitions · 22°C partly cloudy",
    image: "/images/LandingPagenewYorkchapter.png",
    image_credit: "Ceramics by: Fiona Casson",
    signature: "indent-left",
    tagline: "The relentless engine of the global art market.",
    about:
      "New York's AFC chapter operates across the full spectrum of the city's art world — from Chelsea mega-galleries to Bushwick warehouses, from Upper East Side salons to Lower East Side project spaces. We bring together the commercial and the critical, the institutional and the independent.",
    gatherings: [],
    artists: [
      { name: "Camille Duvall", discipline: "Mixed Media", focus: "Race, identity and American mythology" },
      { name: "Eli Torres", discipline: "Sculpture", focus: "Materiality and post-colonial objects" },
      { name: "Juno Park", discipline: "Digital Art", focus: "Algorithmic aesthetics and data bodies" },
    ],
    venues: [],
  },
  {
    city: "Los Angeles",
    slug: "los-angeles",
    chapter: "Ch.04",
    coords: "34.0522°N / 118.2437°W",
    timezone: "PST-8",
    pulse: "5 active exhibitions · 27°C sunny",
    image: "/images/generated_image.png",
    image_credit: "Artwork by: Julie Petris",
    signature: "indent-left",
    tagline: "Where studio culture is a way of life.",
    about:
      "Los Angeles is a city of studios — of light, space and the long game. AFC's LA chapter celebrates the slow practice, the large-scale work, and the artist who builds a world rather than a career. Our programme spans Culver City galleries, Highland Park studios and rooftop conversations under the Pacific sky.",
    gatherings: [],
    artists: [
      { name: "Rosa Delgado", discipline: "Painting", focus: "Latinx diaspora and chromatic memory" },
      { name: "Theo Kwan", discipline: "Video Art", focus: "Industry, celebrity and the constructed image" },
      { name: "Mia Brennan", discipline: "Ceramics", focus: "Body, vessel and ritual form" },
    ],
    venues: [],
  },
  {
    city: "Bangkok",
    slug: "bangkok",
    chapter: "Ch.05",
    coords: "13.7563°N / 100.5018°E",
    timezone: "ICT+7",
    pulse: "5 active exhibitions · 33°C tropical",
    image: "/images/Landingpagebangkokchapter.png",
    image_credit: "Artwork by: Pare Patcharapa",
    signature: "indent-left",
    tagline: "A city of contradictions, colour and creative momentum.",
    about:
      "Bangkok's AFC chapter embraces the energy of Southeast Asia's fastest-growing art scene. From the gallery corridors of the Bangkok Art Biennale to the independent spaces of Ari and Thonglor, our programme celebrates local artists while forging connections across the ASEAN region and beyond.",
    gatherings: [],
    artists: [
      { name: "Naphat Saeng", discipline: "Installation", focus: "Thai mythology and contemporary ritual" },
      { name: "Ploy Jirawat", discipline: "Painting", focus: "Gender, landscape and tropical colour" },
      { name: "Deva Mahanakorn", discipline: "Photography", focus: "Urban migration and sacred space" },
    ],
    venues: [],
  },
  {
    city: "Milano",
    slug: "milano",
    chapter: "Ch.06",
    coords: "45.4654°N / 9.1859°E",
    timezone: "CET+1",
    pulse: "6 active exhibitions · 24°C clear",
    image: "/images/LandingpageMalanochapter.jpg",
    image_credit: "Artwork by: Renato Gaita",
    signature: "indent-left",
    tagline: "Design, fashion and fine art in perpetual conversation.",
    about:
      "Milan's AFC chapter sits at the crossroads of design culture, fashion industry and the fine art world. Our programme draws on this unique context — commissioning works that engage with craft, luxury and the politics of beauty, while maintaining rigorous critical standards.",
    gatherings: [],
    artists: [
      { name: "Giulia Ferretti", discipline: "Sculpture", focus: "Industrial materials and feminine form" },
      { name: "Marco Barone", discipline: "Photography", focus: "Architecture, luxury and the gaze" },
      { name: "Elena Russo", discipline: "Painting", focus: "Colour theory and Italian landscape" },
    ],
    venues: [],
  },
  {
    city: "Toronto",
    slug: "toronto",
    chapter: "Ch.07",
    coords: "43.6532°N / 79.3832°W",
    timezone: "EST-5",
    pulse: "4 active exhibitions · 18°C partly cloudy",
    image: "/images/LandingpageTorontochapter.png",
    image_credit: "Artwork by: Christie Melville",
    signature: "indent-left",
    tagline: "A quiet confidence in a city that knows its own worth.",
    about:
      "Toronto's AFC chapter celebrates one of the most quietly consequential art cities in the world. From the galleries of Ossington to the institutions of the Harbourfront, we convene artists and collectors engaged in a distinctly Canadian conversation about land, identity and the global dialogue.",
    gatherings: [],
    artists: [
      { name: "Aisha Mbeki", discipline: "Mixed Media", focus: "Diaspora, archive and Black Canadian identity" },
      { name: "David Clearsky", discipline: "Painting", focus: "Indigenous landscape and abstraction" },
      { name: "Soo-Jin Yun", discipline: "Installation", focus: "Memory, migration and domestic space" },
    ],
    venues: [],
  },
  {
    city: "Zurich",
    slug: "zurich",
    chapter: "Ch.08",
    coords: "47.3769°N / 8.5417°E",
    timezone: "CET+1",
    pulse: "3 active exhibitions · 16°C clear",
    image: "/images/LandingpageZurich.jpg",
    image_credit: "Artwork by: Saskia Key",
    signature: "indent-left",
    tagline: "Precision, rigour and the long-term view.",
    about:
      "Zurich's AFC chapter reflects the city's character: measured, rigorous and deeply serious about quality. As a global centre for art finance and collecting, Zurich offers a unique vantage point on the art market. Our programme balances critical discourse with collector engagement in one of Europe's most important art cities.",
    gatherings: [],
    artists: [
      { name: "Petra Leuenberger", discipline: "Drawing", focus: "Precision, line and conceptual systems" },
      { name: "Hans Zimmermann", discipline: "Sculpture", focus: "Industrial materials and Alpine landscape" },
      { name: "Miriam Keller", discipline: "Photography", focus: "Institutional spaces and power" },
    ],
    venues: [],
  },
];
/**
 * Single source of truth for chapter names.
 *
 * Six pages previously hardcoded their own chapter lists and they had drifted
 * apart — EventCalendar offered Tokyo/Berlin/Seoul/Mexico City and omitted
 * seven real chapters entirely. Import from here so adding a chapter above
 * updates every filter and dropdown in the app at once.
 */
export const CHAPTER_NAMES = CHAPTERS.map((c) => c.city);

/** Chapter options for a profile or record that must belong to one. */
export const CHAPTER_OPTIONS = [...CHAPTER_NAMES, "Other"];

/** Chapter options for a filter, including the "show everything" entry. */
export const chapterFilterOptions = (allLabel = "All Chapters") => [
  allLabel,
  ...CHAPTER_OPTIONS,
];