// Typed species catalogue and pure state helpers for the field guide app.
// Filtering, sightings, and notes stay pure here; FieldGuide.qml holds state.

export type Season = "Breeding" | "Year-round"

export interface Bird {
    readonly index: number
    readonly name: string
    readonly latin: string
    readonly lengthCm: number
    readonly wingspanCm: number
    readonly season: Season
    readonly blurb: string
}

export interface NoteEntry {
    readonly latin: string
    readonly text: string
}

const puffin: Bird = {
    index: 0,
    name: "Atlantic puffin",
    latin: "Fratercula arctica",
    lengthCm: 30,
    wingspanCm: 53,
    season: "Breeding",
    blurb: "Burrow-nester on grassy clifftops. The bright bill is a breeding-season dress; in winter it comes off.",
}

export const species: readonly Bird[] = [
    puffin,
    {
        index: 1,
        name: "Northern gannet",
        latin: "Morus bassanus",
        lengthCm: 94,
        wingspanCm: 172,
        season: "Breeding",
        blurb: "Plunge-dives from 30 metres, folding back its wings at the last moment. Colonies are cities: tens of thousands of nests.",
    },
    {
        index: 2,
        name: "Common eider",
        latin: "Somateria mollissima",
        lengthCm: 65,
        wingspanCm: 95,
        season: "Year-round",
        blurb: "A sea duck lined with its own down. Females gather ducklings into creches guarded by several adults.",
    },
    {
        index: 3,
        name: "Arctic tern",
        latin: "Sterna paradisaea",
        lengthCm: 35,
        wingspanCm: 80,
        season: "Breeding",
        blurb: "Flies from Arctic summer to Antarctic summer and back — two summers a year, some 70,000 km of flying.",
    },
    {
        index: 4,
        name: "European shag",
        latin: "Gulosus aristotelis",
        lengthCm: 73,
        wingspanCm: 100,
        season: "Year-round",
        blurb: "A slender, green-sheened cormorant of rocky coasts. Swims low, then stands with wings held out to dry.",
    },
    {
        index: 5,
        name: "Black-legged kittiwake",
        latin: "Rissa tridactyla",
        lengthCm: 39,
        wingspanCm: 95,
        season: "Breeding",
        blurb: "The cliff gull that calls its own name. Nests on ledges so narrow the chicks sit facing the rock.",
    },
    {
        index: 6,
        name: "Common guillemot",
        latin: "Uria aalge",
        lengthCm: 43,
        wingspanCm: 70,
        season: "Breeding",
        blurb: "Packs shoulder to shoulder on sea-cliff ledges. Its single egg is pointed, so it rolls in a tight circle, not off.",
    },
    {
        index: 7,
        name: "Manx shearwater",
        latin: "Puffinus puffinus",
        lengthCm: 34,
        wingspanCm: 82,
        season: "Breeding",
        blurb: "Glides stiff-winged over the swell by day; comes to its burrow only at night, calling weirdly in the dark.",
    },
    {
        index: 8,
        name: "Great skua",
        latin: "Stercorarius skua",
        lengthCm: 55,
        wingspanCm: 136,
        season: "Breeding",
        blurb: "A pirate: harries other seabirds until they drop their catch, and defends its own moorland nest against anything.",
    },
]

export function birdAt(index: number): Bird {
    return species[index] ?? puffin
}

export function filterSpecies(query: string): Bird[] {
    const needle = query.trim().toLowerCase()
    const out: Bird[] = []
    for (const bird of species) {
        if (
            needle === "" ||
            bird.name.toLowerCase().includes(needle) ||
            bird.latin.toLowerCase().includes(needle)
        ) {
            out.push(bird)
        }
    }
    return out
}

export function isSeen(seenList: readonly string[], latin: string): boolean {
    return seenList.indexOf(latin) >= 0
}

// Sightings are keyed by Latin name so filtering the list never loses them.
export function setSeen(seenList: readonly string[], latin: string, mark: boolean): string[] {
    const next: string[] = []
    for (const item of seenList) {
        if (item !== latin) {
            next.push(item)
        }
    }
    if (mark) {
        next.push(latin)
    }
    return next
}

export function noteFor(entries: readonly NoteEntry[], latin: string): string {
    for (const entry of entries) {
        if (entry.latin === latin) {
            return entry.text
        }
    }
    return ""
}

export function setNote(entries: readonly NoteEntry[], latin: string, text: string): NoteEntry[] {
    const next: NoteEntry[] = []
    let replaced = false
    for (const entry of entries) {
        if (entry.latin === latin) {
            if (text !== "") {
                next.push({ latin, text })
            }
            replaced = true
        } else {
            next.push(entry)
        }
    }
    if (!replaced && text !== "") {
        next.push({ latin, text })
    }
    return next
}

export function barRatio(value: number, scaleMax: number): number {
    if (scaleMax <= 0) {
        return 0
    }
    return Math.max(0, Math.min(1, value / scaleMax))
}
