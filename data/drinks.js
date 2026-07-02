/*
 * drinks.js — Curated open drink database for CalBAC
 * ----------------------------------------------------------------------------
 * Each entry: { name, category, abv (percent), oz (typical serving) }.
 * ABV values are typical/label figures; servings are common pour sizes. Users
 * can always override volume + ABV, or enter a fully custom drink. This is a
 * representative starter set (not the 3,000-profile commercial database) and is
 * trivially extensible — add rows here or load a JSON file.
 * ----------------------------------------------------------------------------
 */

const DRINKS = [
  // ---- Beer / Lager -------------------------------------------------------
  { name: 'Light beer (Bud Light, Coors Light)', category: 'Beer', abv: 4.2, oz: 12 },
  { name: 'Domestic lager (Budweiser)',          category: 'Beer', abv: 5.0, oz: 12 },
  { name: 'Mexican lager (Corona, Modelo)',      category: 'Beer', abv: 4.5, oz: 12 },
  { name: 'Pilsner (Pilsner Urquell)',           category: 'Beer', abv: 4.4, oz: 12 },
  { name: 'Craft IPA',                           category: 'Beer', abv: 6.8, oz: 12 },
  { name: 'Double / Imperial IPA',               category: 'Beer', abv: 8.5, oz: 12 },
  { name: 'Hefeweizen / Wheat',                  category: 'Beer', abv: 5.2, oz: 12 },
  { name: 'Amber ale',                           category: 'Beer', abv: 5.5, oz: 12 },
  { name: 'Stout (Guinness Draught)',            category: 'Beer', abv: 4.2, oz: 16 },
  { name: 'Imperial stout',                      category: 'Beer', abv: 9.0, oz: 12 },
  { name: 'Belgian tripel',                      category: 'Beer', abv: 9.5, oz: 12 },
  { name: 'Malt liquor (40 oz)',                 category: 'Beer', abv: 6.0, oz: 40 },
  { name: 'Pint of draft (craft, 16 oz)',        category: 'Beer', abv: 6.0, oz: 16 },
  { name: 'Tall boy (24 oz, 5%)',                category: 'Beer', abv: 5.0, oz: 24 },
  { name: 'Non-alcoholic beer',                  category: 'Beer', abv: 0.5, oz: 12 },

  // ---- Hard seltzer / RTD -------------------------------------------------
  { name: 'Hard seltzer (White Claw)',           category: 'Seltzer', abv: 5.0, oz: 12 },
  { name: 'Strong seltzer',                      category: 'Seltzer', abv: 8.0, oz: 12 },
  { name: 'High Noon / vodka seltzer',           category: 'Seltzer', abv: 4.5, oz: 12 },
  { name: 'Truly Extra',                         category: 'Seltzer', abv: 8.0, oz: 12 },

  // ---- Wine ---------------------------------------------------------------
  { name: 'Red wine',                            category: 'Wine', abv: 13.5, oz: 5 },
  { name: 'White wine',                          category: 'Wine', abv: 12.0, oz: 5 },
  { name: 'Rosé',                                category: 'Wine', abv: 12.0, oz: 5 },
  { name: 'Zinfandel (high-alc)',                category: 'Wine', abv: 15.0, oz: 5 },
  { name: 'Champagne / sparkling',               category: 'Wine', abv: 12.0, oz: 5 },
  { name: 'Prosecco',                            category: 'Wine', abv: 11.0, oz: 5 },
  { name: 'Moscato (sweet)',                     category: 'Wine', abv: 8.0, oz: 5 },
  { name: 'Port (fortified)',                    category: 'Wine', abv: 20.0, oz: 3 },
  { name: 'Sherry',                              category: 'Wine', abv: 17.5, oz: 3 },
  { name: 'Large restaurant pour (9 oz)',        category: 'Wine', abv: 13.5, oz: 9 },
  { name: 'Sangria',                             category: 'Wine', abv: 9.0, oz: 6 },

  // ---- Spirits (neat / shot) ---------------------------------------------
  { name: 'Vodka (80 proof shot)',              category: 'Spirit', abv: 40.0, oz: 1.5 },
  { name: 'Whiskey (80 proof shot)',            category: 'Spirit', abv: 40.0, oz: 1.5 },
  { name: 'Tequila (shot)',                     category: 'Spirit', abv: 40.0, oz: 1.5 },
  { name: 'Rum (shot)',                         category: 'Spirit', abv: 40.0, oz: 1.5 },
  { name: 'Gin (shot)',                         category: 'Spirit', abv: 40.0, oz: 1.5 },
  { name: 'Bourbon (90 proof)',                 category: 'Spirit', abv: 45.0, oz: 1.5 },
  { name: 'Cask-strength whiskey (100+ proof)', category: 'Spirit', abv: 50.0, oz: 1.5 },
  { name: 'Everclear / grain (double)',         category: 'Spirit', abv: 60.0, oz: 1.5 },
  { name: 'Double pour (2 oz)',                 category: 'Spirit', abv: 40.0, oz: 2 },

  // ---- Cocktails / mixed --------------------------------------------------
  { name: 'Margarita',                          category: 'Cocktail', abv: 13.0, oz: 6 },
  { name: 'Martini',                            category: 'Cocktail', abv: 28.0, oz: 3.5 },
  { name: 'Manhattan',                          category: 'Cocktail', abv: 30.0, oz: 3.5 },
  { name: 'Old Fashioned',                      category: 'Cocktail', abv: 32.0, oz: 3 },
  { name: 'Negroni',                            category: 'Cocktail', abv: 24.0, oz: 3 },
  { name: 'Long Island Iced Tea',               category: 'Cocktail', abv: 22.0, oz: 8 },
  { name: 'Gin & Tonic',                        category: 'Cocktail', abv: 9.0, oz: 8 },
  { name: 'Rum & Coke',                         category: 'Cocktail', abv: 10.0, oz: 8 },
  { name: 'Vodka soda',                         category: 'Cocktail', abv: 11.0, oz: 8 },
  { name: 'Moscow Mule',                        category: 'Cocktail', abv: 10.0, oz: 8 },
  { name: 'Mojito',                             category: 'Cocktail', abv: 12.0, oz: 8 },
  { name: 'Mimosa',                             category: 'Cocktail', abv: 6.0, oz: 6 },
  { name: 'Cosmopolitan',                       category: 'Cocktail', abv: 22.0, oz: 4 },
  { name: 'Whiskey sour',                       category: 'Cocktail', abv: 18.0, oz: 4 },
  { name: 'Jell-O shot',                        category: 'Cocktail', abv: 12.0, oz: 1 },

  // ---- Custom placeholder -------------------------------------------------
  { name: 'Custom drink…',                      category: 'Custom', abv: 5.0, oz: 12 },
];

if (typeof module !== 'undefined' && module.exports) module.exports = DRINKS;
