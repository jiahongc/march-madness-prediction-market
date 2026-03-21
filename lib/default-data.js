// Fallback data — static Polymarket odds
export const DEFAULT_REGIONS = {
  east: {
    name: "East Region",
    round1: [
      {
        top: { seed: 1, team: "Duke", abbr: "DUKE" },
        bottom: { seed: 16, team: "Siena", abbr: "SIENA" },
        topOdds: 99.3, bottomOdds: 0.9,
        url: "https://polymarket.com/sports/cbb/cbb-siena-duke-2026-03-19",
        date: "Mar 19"
      },
      {
        top: { seed: 8, team: "Ohio State", abbr: "OSU" },
        bottom: { seed: 9, team: "TCU", abbr: "TCU" },
        topOdds: 57, bottomOdds: 44,
        url: "https://polymarket.com/sports/cbb/cbb-tcu-ohiost-2026-03-19",
        date: "Mar 19"
      },
      {
        top: { seed: 5, team: "St. John's", abbr: "SJU" },
        bottom: { seed: 12, team: "Northern Iowa", abbr: "UNI" },
        topOdds: 84, bottomOdds: 19,
        url: "https://polymarket.com/sports/cbb/cbb-niowa-stjohn-2026-03-20",
        date: "Mar 20"
      },
      {
        top: { seed: 4, team: "Kansas", abbr: "KU" },
        bottom: { seed: 13, team: "CA Baptist", abbr: "CBU" },
        topOdds: 92, bottomOdds: 10,
        url: "https://polymarket.com/sports/cbb/cbb-cabap-kan-2026-03-20",
        date: "Mar 20"
      },
      {
        top: { seed: 6, team: "Louisville", abbr: "LOU" },
        bottom: { seed: 11, team: "South Florida", abbr: "USF" },
        topOdds: 68, bottomOdds: 35,
        url: "https://polymarket.com/sports/cbb/cbb-sfl-lou-2026-03-19",
        date: "Mar 19"
      },
      {
        top: { seed: 3, team: "Michigan St.", abbr: "MSU" },
        bottom: { seed: 14, team: "N. Dakota St.", abbr: "NDSU" },
        topOdds: 93, bottomOdds: 9,
        url: "https://polymarket.com/sports/cbb/cbb-ndkst-mst-2026-03-19",
        date: "Mar 19"
      },
      {
        top: { seed: 7, team: "UCLA", abbr: "UCLA" },
        bottom: { seed: 10, team: "UCF", abbr: "UCF" },
        topOdds: 68, bottomOdds: 34,
        url: "https://polymarket.com/sports/cbb/cbb-ucf-ucla-2026-03-20",
        date: "Mar 20"
      },
      {
        top: { seed: 2, team: "UConn", abbr: "UCONN" },
        bottom: { seed: 15, team: "Furman", abbr: "FUR" },
        topOdds: 95, bottomOdds: 7,
        url: "https://polymarket.com/sports/cbb/cbb-furman-uconn-2026-03-20",
        date: "Mar 20"
      },
    ]
  },
  south: {
    name: "South Region",
    round1: [
      {
        top: { seed: 1, team: "Florida", abbr: "UF" },
        bottom: { seed: 16, team: "Prairie View A&M", abbr: "PVAM" },
        topOdds: 99, bottomOdds: 2,
        url: "https://polymarket.com/sports/cbb/cbb-pvam-fl-2026-03-19",
        date: "Mar 19"
      },
      {
        top: { seed: 8, team: "Clemson", abbr: "CLEM" },
        bottom: { seed: 9, team: "Iowa", abbr: "IOWA" },
        topOdds: 44, bottomOdds: 57,
        url: "https://polymarket.com/sports/cbb/cbb-iowa-clmsn-2026-03-20",
        date: "Mar 20"
      },
      {
        top: { seed: 5, team: "Vanderbilt", abbr: "VANDY" },
        bottom: { seed: 12, team: "McNeese", abbr: "MCN" },
        topOdds: 85, bottomOdds: 17,
        url: "https://polymarket.com/sports/cbb/cbb-mcnst-vand-2026-03-19",
        date: "Mar 19"
      },
      {
        top: { seed: 4, team: "Nebraska", abbr: "NEB" },
        bottom: { seed: 13, team: "Troy", abbr: "TROY" },
        topOdds: 89, bottomOdds: 13,
        url: "https://polymarket.com/sports/cbb/cbb-troy-nebr-2026-03-19",
        date: "Mar 19"
      },
      {
        top: { seed: 6, team: "North Carolina", abbr: "UNC" },
        bottom: { seed: 11, team: "VCU", abbr: "VCU" },
        topOdds: 56, bottomOdds: 45,
        url: "https://polymarket.com/sports/cbb/cbb-vcu-ncar-2026-03-19",
        date: "Mar 19"
      },
      {
        top: { seed: 3, team: "Illinois", abbr: "ILL" },
        bottom: { seed: 14, team: "Penn", abbr: "PENN" },
        topOdds: 97.6, bottomOdds: 3.9,
        url: "https://polymarket.com/sports/cbb/cbb-penn-ill-2026-03-19",
        date: "Mar 19"
      },
      {
        top: { seed: 7, team: "Saint Mary's", abbr: "SMC" },
        bottom: { seed: 10, team: "Texas A&M", abbr: "TAMU" },
        topOdds: 60, bottomOdds: 41,
        url: "https://polymarket.com/sports/cbb/cbb-txam-stmry-2026-03-19",
        date: "Mar 19"
      },
      {
        top: { seed: 2, team: "Houston", abbr: "HOU" },
        bottom: { seed: 15, team: "Idaho", abbr: "IDHO" },
        topOdds: 97.8, bottomOdds: 3.5,
        url: "https://polymarket.com/sports/cbb/cbb-idaho-hou-2026-03-19",
        date: "Mar 19"
      },
    ]
  },
  west: {
    name: "West Region",
    round1: [
      {
        top: { seed: 1, team: "Arizona", abbr: "ARIZ" },
        bottom: { seed: 16, team: "Long Island", abbr: "LIU" },
        topOdds: 99.2, bottomOdds: 0.9,
        url: "https://polymarket.com/sports/cbb/cbb-liub-arz-2026-03-20",
        date: "Mar 20"
      },
      {
        top: { seed: 8, team: "Villanova", abbr: "NOVA" },
        bottom: { seed: 9, team: "Utah State", abbr: "USU" },
        topOdds: 45, bottomOdds: 56,
        url: "https://polymarket.com/sports/cbb/cbb-utahst-vill-2026-03-20",
        date: "Mar 20"
      },
      {
        top: { seed: 5, team: "Wisconsin", abbr: "WIS" },
        bottom: { seed: 12, team: "High Point", abbr: "HPU" },
        topOdds: 82, bottomOdds: 23,
        url: "https://polymarket.com/sports/cbb/cbb-hpnt-wisc-2026-03-19",
        date: "Mar 19"
      },
      {
        top: { seed: 4, team: "Arkansas", abbr: "ARK" },
        bottom: { seed: 13, team: "Hawai'i", abbr: "HAW" },
        topOdds: 90, bottomOdds: 11,
        url: "https://polymarket.com/sports/cbb/cbb-hawaii-ark-2026-03-19",
        date: "Mar 19"
      },
      {
        top: { seed: 6, team: "BYU", abbr: "BYU" },
        bottom: { seed: 11, team: "Texas", abbr: "TEX" },
        topOdds: 70, bottomOdds: 32,
        url: "https://polymarket.com/sports/cbb/cbb-tx-byu-2026-03-19",
        date: "Mar 19"
      },
      {
        top: { seed: 3, team: "Gonzaga", abbr: "ZAGS" },
        bottom: { seed: 14, team: "Kennesaw St.", abbr: "KSU" },
        topOdds: 96, bottomOdds: 6,
        url: "https://polymarket.com/sports/cbb/cbb-kenest-gnzg-2026-03-19",
        date: "Mar 19"
      },
      {
        top: { seed: 7, team: "Miami", abbr: "MIA" },
        bottom: { seed: 10, team: "Missouri", abbr: "MIZ" },
        topOdds: 55, bottomOdds: 46,
        url: "https://polymarket.com/sports/cbb/cbb-missr-mia-2026-03-20",
        date: "Mar 20"
      },
      {
        top: { seed: 2, team: "Purdue", abbr: "PUR" },
        bottom: { seed: 15, team: "Queens", abbr: "QUE" },
        topOdds: 97.9, bottomOdds: 3.0,
        url: "https://polymarket.com/sports/cbb/cbb-queen-pur-2026-03-20",
        date: "Mar 20"
      },
    ]
  },
  midwest: {
    name: "Midwest Region",
    round1: [
      {
        top: { seed: 1, team: "Michigan", abbr: "MICH" },
        bottom: { seed: 16, team: "Howard", abbr: "HOW" },
        topOdds: 99, bottomOdds: 2,
        url: "https://polymarket.com/sports/cbb/cbb-how-mich-2026-03-20",
        date: "Mar 20"
      },
      {
        top: { seed: 8, team: "Georgia", abbr: "UGA" },
        bottom: { seed: 9, team: "Saint Louis", abbr: "SLU" },
        topOdds: 59, bottomOdds: 42,
        url: "https://polymarket.com/sports/cbb/cbb-stlou-ga-2026-03-19",
        date: "Mar 19"
      },
      {
        top: { seed: 5, team: "Texas Tech", abbr: "TTU" },
        bottom: { seed: 12, team: "Akron", abbr: "AKR" },
        topOdds: 72, bottomOdds: 29,
        url: "https://polymarket.com/sports/cbb/cbb-akron-txtech-2026-03-20",
        date: "Mar 20"
      },
      {
        top: { seed: 4, team: "Alabama", abbr: "BAMA" },
        bottom: { seed: 13, team: "Hofstra", abbr: "HOF" },
        topOdds: 89, bottomOdds: 14,
        url: "https://polymarket.com/sports/cbb/cbb-hofst-ala-2026-03-20",
        date: "Mar 20"
      },
      {
        top: { seed: 6, team: "Tennessee", abbr: "TENN" },
        bottom: { seed: 11, team: "Miami (OH)", abbr: "MIAOH" },
        topOdds: 70, bottomOdds: 32,
        url: "https://polymarket.com/sports/cbb/cbb-miaoh-tenn-2026-03-20",
        date: "Mar 20"
      },
      {
        top: { seed: 3, team: "Virginia", abbr: "UVA" },
        bottom: { seed: 14, team: "Wright St.", abbr: "WSU" },
        topOdds: 95, bottomOdds: 6,
        url: "https://polymarket.com/sports/cbb/cbb-wrght-vir-2026-03-20",
        date: "Mar 20"
      },
      {
        top: { seed: 7, team: "Kentucky", abbr: "UK" },
        bottom: { seed: 10, team: "Santa Clara", abbr: "SCU" },
        topOdds: 61, bottomOdds: 42,
        url: "https://polymarket.com/sports/cbb/cbb-sanclr-uk-2026-03-20",
        date: "Mar 20"
      },
      {
        top: { seed: 2, team: "Iowa State", abbr: "ISU" },
        bottom: { seed: 15, team: "Tennessee St.", abbr: "TSU" },
        topOdds: 98.7, bottomOdds: 3.9,
        url: "https://polymarket.com/sports/cbb/cbb-tenst-iowast-2026-03-20",
        date: "Mar 20"
      },
    ]
  }
};
