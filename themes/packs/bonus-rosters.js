// Five additional unofficial DeckVerse local-play rosters. No likenesses, posters or licensed artwork embedded.
// Historical athletes and fictional characters are identifiers only; game scores are subjective editorial ratings.
// Mixed continuities and legacy/non-canonical entries can appear. Character and brand rights require review.
const section=(group,role,list)=>Object.freeze({group,role,names:Object.freeze(list.split('|'))});
export const BONUS_PACK_ROSTERS=Object.freeze({
  dragonball:Object.freeze([
    section("Z Fighters","hero","Goku|Vegeta|Gohan|Piccolo|Krillin|Tien Shinhan|Yamcha|Chiaotzu|Master Roshi|Future Trunks|Kid Trunks|Goten|Videl|Pan|Android 18|Android 17"),
    section("Saiyans & Allies","saiyan","Bardock|Raditz|Nappa|Cabba|Caulifla|Kale|Broly|Tarble|Gine|King Vegeta|Turles|Yajirobe|Mr. Satan|Uub|Pikkon|Nail"),
    section("Classic Villains","villain","Frieza|Cell|Majin Buu|Kid Buu|Super Buu|Dabura|Captain Ginyu|Jeice|Burter|Recoome|Guldo|Zarbon|Dodoria|King Cold|Baby|Omega Shenron"),
    section("Gods & Super Rivals","cosmic","Beerus|Whis|Vados|Champa|Zeno|Grand Priest|Jiren|Toppo|Dyspo|Hit|Frost|Goku Black|Zamasu|Fused Zamasu|Moro|Granolah"),
    section("Androids & Legends","android","Android 16|Android 19|Dr. Gero|Android 13|Android 21|Gamma 1|Gamma 2|Cell Max|Good Buu|Supreme Kai|Kibito|Elder Kai|Mojito (Angel)|Belmod|Marcarita|Gas")
  ]),
  onepiece:Object.freeze([
    section("Straw Hats & Friends","pirate","Monkey D. Luffy|Roronoa Zoro|Nami|Usopp|Sanji|Tony Tony Chopper|Nico Robin|Franky|Brook|Jinbe|Nefertari Vivi|Karoo|Yamato|Carrot|Trafalgar D. Water Law|Bepo"),
    section("Emperors & Crews","legend","Shanks|Buggy|Marshall D. Teach|Edward Newgate|Portgas D. Ace|Marco|Jozu|Vista|Charlotte Katakuri|Charlotte Linlin|Kaido|King (Beasts Pirates)|Queen (Beasts Pirates)|Jack (Beasts Pirates)|Eustass Kid|Killer"),
    section("Navy & Justice","navy","Monkey D. Garp|Sengoku|Sakazuki|Kuzan|Borsalino|Issho|Aramaki|Smoker|Tashigi|Koby|Helmeppo|Hina|X Drake|Sentomaru|Tsuru|Brannew"),
    section("Rebels & Great Allies","revolution","Monkey D. Dragon|Sabo|Emporio Ivankov|Bartholomew Kuma|Koala|Belo Betty|Morley|Karasu|Lindbergh|Inazuma|Hack|Jewelry Bonney|Silvers Rayleigh|Scopper Gaban|Dracule Mihawk|Boa Hancock"),
    section("Grand Line Adversaries","villain","Donquixote Doflamingo|Crocodile|Enel|Rob Lucci|Kaku|Gecko Moria|Perona|Don Krieg|Arlong|Caesar Clown|Magellan|Shiryu|Bartolomeo|Cavendish|Kin'emon|Kozuki Oden")
  ]),
  wwe:Object.freeze([
    section("Hall of Fame Icons","legend","Hulk Hogan|The Rock|Stone Cold Steve Austin|The Undertaker|Kane|Triple H|Shawn Michaels|Bret Hart|Ric Flair|Randy Savage|Ultimate Warrior|Mick Foley|Kurt Angle|Eddie Guerrero|Chris Jericho|Rey Mysterio"),
    section("Modern Headliners","modern","John Cena|Roman Reigns|Seth Rollins|Cody Rhodes|Randy Orton|CM Punk|Drew McIntyre|Kevin Owens|Sami Zayn|Gunther|AJ Styles|Finn Bálor|Damian Priest|Jey Uso|Jimmy Uso|LA Knight"),
    section("Powerhouses","powerhouse","Brock Lesnar|Batista|Goldberg|Big Show|Mark Henry|Bobby Lashley|Sheamus|Omos|Umaga|Rikishi|Yokozuna|Andre the Giant|Diesel|Vader|Samoa Joe|Rusev"),
    section("Technicians & Flyers","technical","Daniel Bryan|Rob Van Dam|Jeff Hardy|Matt Hardy|Edge|Christian|Dolph Ziggler|Shinsuke Nakamura|Chad Gable|Shelton Benjamin|Kofi Kingston|Xavier Woods|Big E|Johnny Gargano|Tommaso Ciampa|Ricochet"),
    section("Women's Division Icons","womens","Becky Lynch|Charlotte Flair|Sasha Banks|Bayley|Rhea Ripley|Bianca Belair|Asuka|Iyo Sky|Liv Morgan|Alexa Bliss|Trish Stratus|Lita|Chyna|AJ Lee|Natalya|Naomi")
  ]),
  football:Object.freeze([
    section("All-Time Goal Machines","forward","Lionel Messi|Cristiano Ronaldo|Pelé|Diego Maradona|Ronaldo Nazário|Ronaldinho|Neymar Jr.|Kylian Mbappé|Thierry Henry|Zlatan Ibrahimović|Karim Benzema|Luis Suárez|Robert Lewandowski|Erling Haaland|Mohamed Salah|George Best"),
    section("Playmaking Masters","midfielder","Zinedine Zidane|Xavi Hernández|Andrés Iniesta|Luka Modrić|Kevin De Bruyne|Toni Kroos|Andrea Pirlo|Mesut Özil|David Silva|Kaká|Bruno Fernandes|Jude Bellingham|Jamal Musiala|Martin Ødegaard|İlkay Gündoğan|Michael Laudrup"),
    section("Attacking Superstars","forward","Sadio Mané|Son Heung-min|Gareth Bale|Eden Hazard|Vinícius Júnior|Rodrygo|Arjen Robben|Franck Ribéry|Ángel Di María|Bukayo Saka|Raheem Sterling|Antoine Griezmann|Paulo Dybala|Harry Kane|Didier Drogba|Samuel Eto'o"),
    section("Defensive Legends","defender","Sergio Ramos|Virgil van Dijk|Paolo Maldini|Franz Beckenbauer|Fabio Cannavaro|Carles Puyol|Alessandro Nesta|Roberto Carlos|Dani Alves|Marcelo Vieira|Cafu|Philipp Lahm|Gerard Piqué|Giorgio Chiellini|Nemanja Vidić|John Terry"),
    section("Women's Football Legends","women","Marta|Alex Morgan|Sam Kerr|Ada Hegerberg|Aitana Bonmatí|Alexia Putellas|Lucy Bronze|Wendie Renard|Megan Rapinoe|Christine Sinclair|Lauren James|Sophia Smith|Mary Earps|Christiane Endler|Carli Lloyd|Jenni Hermoso")
  ]),
  wizarding:Object.freeze([
    section("Hogwarts Students","student","Harry Potter|Hermione Granger|Ron Weasley|Ginny Weasley|Neville Longbottom|Luna Lovegood|Draco Malfoy|Cedric Diggory|Cho Chang|Fred Weasley|George Weasley|Seamus Finnigan|Dean Thomas|Lavender Brown|Parvati Patil|Padma Patil"),
    section("Teachers & School Staff","professor","Albus Dumbledore|Minerva McGonagall|Severus Snape|Rubeus Hagrid|Filius Flitwick|Pomona Sprout|Remus Lupin|Sybill Trelawney|Horace Slughorn|Dolores Umbridge|Gilderoy Lockhart|Quirinus Quirrell|Charity Burbage|Aurora Sinistra|Rolanda Hooch|Argus Filch"),
    section("Order & Allies","order","Sirius Black|James Potter|Lily Potter|Molly Weasley|Arthur Weasley|Nymphadora Tonks|Kingsley Shacklebolt|Alastor Moody|Aberforth Dumbledore|Mundungus Fletcher|Bill Weasley|Charlie Weasley|Percy Weasley|Fleur Delacour|Dedalus Diggle|Elphias Doge"),
    section("Dark Arts & Adversaries","dark","Lord Voldemort|Bellatrix Lestrange|Lucius Malfoy|Narcissa Malfoy|Peter Pettigrew|Barty Crouch Jr.|Antonin Dolohov|Fenrir Greyback|Yaxley|Alecto Carrow|Amycus Carrow|Regulus Black|Gellert Grindelwald|Nagini|Scabior|Walden Macnair"),
    section("Fantastic Beasts & Legends","legend","Newt Scamander|Tina Goldstein|Queenie Goldstein|Jacob Kowalski|Leta Lestrange|Theseus Scamander|Yusuf Kama|Credence Barebone|Nicolas Flamel|Bathilda Bagshot|Garrick Ollivander|Rita Skeeter|Pius Thicknesse|Madame Maxime|Viktor Krum|Cornelius Fudge")
  ])
});
