import { config } from "dotenv";
config({ path: ".env.local" });

import { saveReps, saveDefaultScId } from "../src/lib/kv";
import { Rep } from "../src/lib/types";

const repNames = [
  "Aaron Stevenson", "Aarti Sagar", "Adam Liddelow", "Adrian O'Brien",
  "Alan Turner", "Alex De Wit", "Alex Savitt", "Alexander Jaap",
  "Amrit Bonnet", "Andrew Landsman", "Andrianna Rawlings", "Anthony Healy",
  "Antony Barrett", "Antony Marziban", "Anyka Sokun", "Avi Shah",
  "Ben Bennett", "Benoit Chappet", "Bhavin Vaja", "Bilal Mughal",
  "Bradley Hamilton", "Bradley Mitchell", "Byung Koo Mulder", "Callum McKinney",
  "Carl Hetherington", "Chaiyada Prajeeyachat", "Charles Richardson",
  "Charles Whitebread", "Charlie Warren", "Charlotte Jackson", "Chea Darayuth",
  "Chloe Curran", "Chris Ball", "Christopher Spencer", "Claire Spinks",
  "Daniel Abbott", "Danny Cousins", "Darren Halls", "Darren Height",
  "Darsh Shah", "David Collins", "David Moss", "Dean Elliott",
  "Deborah Kennedy", "Declan Hewitt", "Declan Trainor", "Derik Antony",
  "Dewi Evans", "Dominic Mustafa", "Ed Lister", "Ed Teasdale",
  "Eden Hayday", "Elijah Francis", "Emma Norton Selzer", "Ethan De Kock",
  "Faraaz Iqbal", "Faye McDonald", "Francesco Morabito", "Gavin Snook",
  "George Ironton", "George Stainton", "Georgia Thomas", "Haitham Azzee",
  "Hannah Crook", "Haroon Mohammed", "Harry Bevington", "Harry Stevens",
  "Hashem Al-Atrakchi", "Islam Elseedawy", "Jack Basford", "Jack Burt",
  "Jack Gorgon", "Jacob Chase", "Jacob Hall", "James Duong",
  "James Round", "James Trewren", "Jamie McNish", "Jamie Smith-Milne",
  "Jared Allen", "Jesper Sommer", "Jessica Cook", "Jessica Rooney",
  "Joe Cookney", "John Klipp", "Jonah Sukkar", "Jonathan Brookes",
  "Jonathon Bithell", "Jonathon Jay", "Jordan Donald", "Jordan Evason",
  "Jordan Maxwell", "Joseph Cookney", "Joseph Kerwin", "Joseph Morling",
  "Joshua Rigby", "Judy Blair", "Kai Squires", "Kane Tucker",
  "Kareem Rathore", "Khanh Phan", "Kyle Acton", "Kylee Lancsar",
  "Lalith Mangalarapu", "Leanne Gibb", "Lewis Paterson", "Lewis Smith",
  "Liam Fowler", "Linda Lago", "Lloyd Simpson", "Lois Vallely",
  "Louis Walker", "Louise Powell", "Lucas Narburgh", "Luis Jimenez",
  "Luke Bennett", "Luke Price", "Mark Seymour", "Mark Sheahan",
  "Martin Orme", "Matt Angell", "Matt Byrne", "Matthew Dean",
  "Matthew Morgan", "Matthew Tailford", "Matthew Thomas", "Melanie Moss",
  "Michael Bennett", "Michael Lennon", "Michael Sappal", "Michael Yuille",
  "Michaela Van De Peer", "Mike Leigh", "Moheen Ahmed", "Mujahid Islam",
  "Nabeel Ashraf", "Natalie Doyle", "Natasha Chamaa", "Nicholas Champion",
  "Nick Simmons", "Nobumitsu Kashiwamura", "Oliver Gorman", "Oliver Jaap",
  "Oliver Mead", "Oliver Taylor", "Oscar Bugeja", "Paul Dodd",
  "Paul Molloy", "Paul Thompson", "Pisa Khou", "Purnima Anand",
  "Rajdeep Jutla", "Ravinder Gill", "Rhian Connelly", "Richard Cawley",
  "Rico Cachucho", "Rikesh Chauhan", "Robert Bronsdon", "Robert Moore",
  "Robin Copley", "Roman Izzo", "Ross Buchanan", "Ruben Garcia",
  "Rupa Alindra", "Ryan Coney", "Ryan Cook", "Ryan Hudson",
  "Sameer Baree", "Samuel Ellis", "Sarfraz Munir", "Sean Fitz-Henley",
  "Sebastian Parnham", "Sebastian Petersson", "Shahid Khan", "Shane Metro",
  "Sharoz Khan", "Simon Davies", "Simon Pitkin", "Stuart McDonald",
  "Sundip Kamboj", "Tapish Bhatt", "Teresa Dunning", "Thomas Goldie",
  "Tom Streader", "Toni Doyle", "Tony Mustafa", "Trevor Keidan",
  "Trung Hieu Le", "Victoria Webdale", "Vincent Wilson", "Wadea Alabdi",
  "William Gray", "Yukie Tanaka", "Zaheer Hussain", "Zavio D'Ercole",
  "Zeeshaan Qayyum",
];

async function seed() {
  const reps: Rep[] = repNames
    .map((name) => ({ name, sc_id: null }))
    .sort((a, b) => a.name.localeCompare(b.name));

  await saveDefaultScId("SC_DEFAULT_001");
  await saveReps(reps);

  console.log(`Seeded ${reps.length} reps and default SC_ID.`);
}

seed().catch((err) => {
  console.error("Seed failed:", err);
  process.exit(1);
});
