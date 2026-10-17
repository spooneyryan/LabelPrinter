import type { DataTable } from "./types.ts";

/*
 * Made-up addresses for trying the app before loading a real list. Real cities and plausible ZIP
 * codes — two of them with the leading zero New England is famous for — on invented streets, with
 * a company and a second address line on only some, so blank-line removal has something to do.
 */
export function sampleAddresses(): DataTable {
    return {
        source: "Sample addresses",
        fields: ["First Name", "Last Name", "Company", "Address", "Address 2", "City", "State", "ZIP"],
        rows: [
            ["Maya", "Thompson", "", "418 Maple Avenue", "", "Portland", "OR", "97205"],
            ["Daniel", "Okafor", "Blue Heron Bakery", "77 Harbor View Road", "Suite 210", "Savannah", "GA", "31401"],
            ["Priya", "Raman", "", "2350 Larkspur Lane", "Apt 4B", "Austin", "TX", "78701"],
            ["Luis", "Hernández", "", "9 Quarry Hill Drive", "", "Burlington", "VT", "05401"],
            ["Grace", "Kim", "Cedar & Pine Studio", "1100 Ironwood Street", "", "Denver", "CO", "80202"],
            ["Samuel", "Whitfield", "", "36 Old Mill Court", "", "Madison", "WI", "53703"],
            ["Aisha", "Bello", "", "512 Juniper Way", "Unit 7", "Santa Fe", "NM", "87501"],
            ["Tomás", "Novak", "Lakeshore Bicycle Co.", "84 Waterfront Plaza", "", "Duluth", "MN", "55802"],
            ["Hannah", "Lindqvist", "", "27 Chestnut Row", "", "Boston", "MA", "02108"],
            ["Marcus", "Reed", "", "650 Summit Ridge Road", "", "Asheville", "NC", "28801"],
            ["Elena", "Petrova", "Northgate Dental", "301 Sagebrush Avenue", "Floor 3", "Boise", "ID", "83702"],
            ["Jun", "Watanabe", "", "15 Lighthouse Terrace", "", "Providence", "RI", "02903"]
        ]
    };
}
