import { config } from "dotenv";
config({ path: ".env.local" });

import { getSupabase } from "../src/lib/supabase";

type SeedAsset = {
  title: string;
  url: string;
  tags: string[];
  shareable: boolean;
};

// Lowercased to match the admin form's parseTags + the API's normalizeTags.
const ASSETS: SeedAsset[] = [
  { title: "The British Expat Wealth Playbook", url: "https://www.datocms-assets.com/137998/1776148852-the-british-expat-wealth-playbook-uae_gcc.pdf?ts=70073c78&dl=the-british-expat-wealth-playbook-uae_gcc.pdf", tags: ["financial planning"], shareable: true },
  { title: "A Practical Guide to UK Tax Residence - For Britons in the Middle East", url: "https://www.datocms-assets.com/137998/1773307912-a-practical-guide-to-uk-tax-residence-amidst-middle-east-tensions.pdf?ts=49a55245&dl=a-practical-guide-to-uk-tax-residence-amidst-middle-east-tensions.pdf", tags: ["tax planning"], shareable: true },
  { title: "End of the UK Tax Year", url: "https://www.datocms-assets.com/137998/1770100454-tax-year-checklist-1.pdf?ts=508fab77&dl=tax-year-checklist-1.pdf", tags: ["tax planning"], shareable: true },
  { title: "Retirement Destinations Attractiveness Report (for UK Nationals) 2026", url: "https://www.datocms-assets.com/137998/1774446519-retirement-destinations-for-uk-nationals-2026.pdf?ts=2a9a5ae9&dl=retirement-destinations-for-uk-nationals-2026.pdf", tags: ["retirement planning"], shareable: true },
  { title: "Retirement Destinations Attractiveness Report (for U.S. Nationals) 2026", url: "https://www.datocms-assets.com/137998/1770367340-us-retirement-destinations-1.pdf?ts=0c9d2260&dl=us-retirement-destinations-1.pdf", tags: ["retirement planning"], shareable: true },
  { title: "UK to UAE: Your Financial Relocation Roadmap", url: "https://www.datocms-assets.com/137998/1764180853-uk-to-uae-financial-roadmap.pdf?ts=1165aa75&dl=uk-to-uae-financial-roadmap.pdf", tags: ["retirement planning"], shareable: true },
  { title: "401(k) & US Retirement Plans", url: "https://www.datocms-assets.com/137998/1777964452-do-you-have-a-401-k.pdf?ts=6b3b87d1&dl=do-you-have-a-401-k.pdf", tags: ["retirement planning"], shareable: true },
  { title: "Budget 2025: Key Takeaways", url: "https://www.datocms-assets.com/137998/1764249329-budget-2025-key-takeaways.pdf?ts=f6c25103&dl=budget-2025-key-takeaways.pdf", tags: ["financial planning"], shareable: true },
  { title: "The British Expat's Guide to Pensions", url: "https://www.datocms-assets.com/137998/1765365675-the-british-expat_s-guide-to-pensions.pdf?ts=fc929061&dl=the-british-expat_s-guide-to-pensions.pdf", tags: ["retirement planning"], shareable: true },
  { title: "Italy Tax Guide", url: "https://www.datocms-assets.com/137998/1745562725-tax-italy_001.pdf?ts=bbd1ef6b&dl=tax-italy_001.pdf", tags: ["tax planning"], shareable: true },
  { title: "Future-Proofing the Family Farm", url: "https://www.datocms-assets.com/137998/1762510828-future-proofing-the-family-farm_nov-2025.pdf?ts=d84c6a57&dl=future-proofing-the-family-farm_nov-2025.pdf", tags: ["financial planning"], shareable: true },
  { title: "Navigating Financial Transitions", url: "https://www.datocms-assets.com/137998/1762518400-navigating-financial-transitions.pdf?ts=f6951bef&dl=navigating-financial-transitions.pdf", tags: ["financial planning"], shareable: true },
  { title: "The Definitive Guide to Financial Freedom After Divorce", url: "https://www.datocms-assets.com/137998/1762515033-the-definitive-guide-to-financial-freedom-after-divorce.pdf?ts=6ce393ae&dl=the-definitive-guide-to-financial-freedom-after-divorce.pdf", tags: ["financial planning"], shareable: true },
  { title: "Tax Guide for Expats in Italy", url: "https://www.datocms-assets.com/137998/1762517665-tax-italy.pdf?ts=b0e4478e&dl=tax-italy.pdf", tags: ["financial planning"], shareable: true },
  { title: "The Importance of Having a Will", url: "https://www.datocms-assets.com/137998/1761906986-the-importance-of-having-a-will.pdf?ts=2946e4b3&dl=the-importance-of-having-a-will.pdf", tags: ["estate planning"], shareable: true },
  { title: "UK Pension Transfer Guide – Australia", url: "https://www.datocms-assets.com/137998/1761903200-uk-pension-transfer-australia.pdf?ts=7a76dc9f&dl=uk-pension-transfer-australia.pdf", tags: ["retirement planning"], shareable: true },
  { title: "UK Tax Return Guide", url: "https://www.datocms-assets.com/137998/1761905651-uk-tax-return.pdf?ts=0f4887bf&dl=uk-tax-return.pdf", tags: ["tax planning"], shareable: true },
  { title: "UK Pension Transfer Guide", url: "https://www.datocms-assets.com/137998/1761900593-uk-pension-transfer.pdf?ts=7c651423&dl=uk-pension-transfer.pdf", tags: ["retirement planning"], shareable: true },
  { title: "Pensions in Europe", url: "https://www.datocms-assets.com/137998/1761821841-pensions-in-europe.pdf?ts=8204112e&dl=pensions-in-europe.pdf", tags: ["retirement planning"], shareable: true },
  { title: "Pension Consolidation Guide", url: "https://www.datocms-assets.com/137998/1761821517-pension-consolidation.pdf?ts=f1101cc6&dl=pension-consolidation.pdf", tags: ["retirement planning"], shareable: true },
  { title: "Offshore Bank Accounts", url: "https://www.datocms-assets.com/137998/1761821016-offshore-bank-accounts.pdf?ts=6e8e7954&dl=offshore-bank-accounts.pdf", tags: ["investments"], shareable: true },
  { title: "UAE Golden Visa", url: "https://www.datocms-assets.com/137998/1761820333-uae-golden-visa.pdf?ts=16ac69f6&dl=uae-golden-visa.pdf", tags: ["financial planning"], shareable: true },
  { title: "Family Investment Company Guide", url: "https://www.datocms-assets.com/137998/1761819694-family-investment-company.pdf?ts=f64ec28c&dl=family-investment-company.pdf", tags: ["tax planning"], shareable: true },
  { title: "Superannuation Guide", url: "https://www.datocms-assets.com/137998/1761670880-superannuation.pdf?ts=9f1872b2&dl=superannuation.pdf", tags: ["retirement planning"], shareable: true },
  { title: "France Tax Guide", url: "https://www.datocms-assets.com/137998/1761657185-tax-france.pdf?ts=09aea115&dl=tax-france.pdf", tags: ["tax planning"], shareable: true },
  { title: "Lasting Powers of Attorney", url: "https://www.datocms-assets.com/137998/1761653897-lasting-power-of-attorney-guide.pdf?ts=d24869d2&dl=lasting-power-of-attorney-guide.pdf", tags: ["estate planning"], shareable: true },
  { title: "Tax Guide for Expats in Florida", url: "https://www.datocms-assets.com/137998/1761651314-tax-florida.pdf?ts=84cf94e1&dl=tax-florida.pdf", tags: ["tax planning"], shareable: true },
  { title: "Planning Your Return to the UK", url: "https://www.datocms-assets.com/137998/1761647741-repatriation-guide.pdf?ts=2603abd3&dl=repatriation-guide.pdf", tags: ["financial planning"], shareable: true },
  { title: "Effective Estate Tax Planning for holders of US Company Shares", url: "https://www.datocms-assets.com/137998/1761647571-effective-estate-tax-planning.pdf?ts=01fd7738&dl=effective-estate-tax-planning.pdf", tags: ["tax planning"], shareable: true },
  { title: "Portugal Tax Guide", url: "https://www.datocms-assets.com/137998/1761647405-portugal-tax-guide.pdf?ts=6afb7455&dl=portugal-tax-guide.pdf", tags: ["tax planning"], shareable: true },
  { title: "Irish Pension Transfer Guide", url: "https://www.datocms-assets.com/137998/1761647226-irish-pension-transfer.pdf?ts=3028e9cb&dl=irish-pension-transfer.pdf", tags: ["retirement planning"], shareable: true },
  { title: "International Private Medical Insurance", url: "https://www.datocms-assets.com/137998/1761643599-international-private-health-insurance.pdf?ts=5d5e0169&dl=international-private-health-insurance.pdf", tags: ["financial planning"], shareable: true },
  { title: "Managing Your UK ISA", url: "https://www.datocms-assets.com/137998/1761642457-managing-your-uk-isa.pdf?ts=20eb37f2&dl=managing-your-uk-isa.pdf", tags: ["investments"], shareable: true },
  { title: "Estate Planning Guide", url: "https://www.datocms-assets.com/137998/1761642145-estate-planning-guide.pdf?ts=9c5a94fa&dl=estate-planning-guide.pdf", tags: ["estate planning"], shareable: true },
  { title: "Retirement Plans for US Resident Aliens", url: "https://www.datocms-assets.com/137998/1761641914-retirement-planning-solutions-for-us-resident-aliens.pdf?ts=0887f1d5&dl=retirement-planning-solutions-for-us-resident-aliens.pdf", tags: ["retirement planning"], shareable: true },
  { title: "Australia Investing & Tax Guide", url: "https://www.datocms-assets.com/137998/1761640298-financial-planning-investing-tax_australia.pdf?ts=f2e46e6b&dl=financial-planning-investing-tax_australia.pdf", tags: ["financial planning"], shareable: true },
  { title: "Enduring Power of Attorney (EPOA) – In-Depth Overview", url: "https://www.datocms-assets.com/137998/1761588789-epoa-in-depth-overview.pdf?ts=4dac7ce2&dl=epoa-in-depth-overview.pdf", tags: ["estate planning"], shareable: true },
  { title: "Options for Regular Saving", url: "https://www.datocms-assets.com/137998/1761588610-regular-savings-guide.pdf?ts=e001b9bc&dl=regular-savings-guide.pdf", tags: ["financial planning"], shareable: true },
  { title: "Corporate Pensions and Savings Solutions", url: "https://www.datocms-assets.com/137998/1761587560-corporate-pensions-and-savings.pdf?ts=65a0c531&dl=corporate-pensions-and-savings.pdf", tags: ["financial planning"], shareable: true },
  { title: "Review Your Pension Solution", url: "https://www.datocms-assets.com/137998/1761582754-review-your-pension-solution.pdf?ts=2def4adf&dl=review-your-pension-solution.pdf", tags: ["retirement planning"], shareable: true },
  { title: "Take Control of Your Money: Use Our Expenditure Questionnaire", url: "https://www.datocms-assets.com/137998/1760708722-take-control-of-your-money-use-our-expenditure-questionnaire.xlsx?ts=79551f84&dl=take-control-of-your-money-use-our-expenditure-questionnaire.xlsx", tags: ["financial planning"], shareable: true },
  { title: "Fixed Indexed Annuities Guide", url: "https://www.datocms-assets.com/137998/1761581952-fixed-indexed-annuities-guide.pdf?ts=0fc20439&dl=fixed-indexed-annuities-guide.pdf", tags: ["investments"], shareable: true },
  { title: "Spain Tax Guide", url: "https://www.datocms-assets.com/137998/1761580217-spain-tax-guide.pdf?ts=fefe5710&dl=spain-tax-guide.pdf", tags: ["tax planning"], shareable: true },
  { title: "Assurance Vie Guide", url: "https://www.datocms-assets.com/137998/1761581249-assurance-vie-guide.pdf?ts=fd5edf40&dl=assurance-vie-guide.pdf", tags: ["tax planning"], shareable: true },
  { title: "UK State Pension Guide", url: "https://www.datocms-assets.com/137998/1773729140-2026-uk-state-pension-1-compressed.pdf?ts=2f388ff3&dl=2026-uk-state-pension-1-compressed.pdf", tags: ["retirement planning"], shareable: true },
  { title: "8 Costly Financial Mistakes in Divorce", url: "https://www.datocms-assets.com/137998/1761579102-8-costly-financial-mistakes-in-divorce_001.pdf?ts=71718e89&dl=8-costly-financial-mistakes-in-divorce_001.pdf", tags: ["financial planning"], shareable: true },
  { title: "Save Up To 67% in Pension Taxes", url: "https://www.datocms-assets.com/137998/1755777643-uk-expats-in-the-middle-east.pdf?ts=a0b4b732&dl=uk-expats-in-the-middle-east.pdf", tags: ["retirement planning"], shareable: true },
  { title: "UK Non-Dom Changes: Are You Impacted?", url: "https://www.datocms-assets.com/137998/1745585224-uk-non-domicile-changes_001.pdf?ts=9bc1f54c&dl=uk-non-domicile-changes_001.pdf", tags: ["estate planning"], shareable: true },
  { title: "Asset Protection", url: "https://www.datocms-assets.com/137998/1745582124-asset-protection_001.pdf?ts=454b8e82&dl=asset-protection_001.pdf", tags: ["estate planning"], shareable: true },
  { title: "Ten Year Tax Rule Guide", url: "https://www.datocms-assets.com/137998/1732115623-10-year-tax-rule-australia-guide.pdf?ts=b8219d79&dl=10-year-tax-rule-australia-guide.pdf", tags: ["tax planning"], shareable: true },
  { title: "Australian 10 Year Tax Rule Guide", url: "https://www.datocms-assets.com/137998/1732028838-10-year-tax-rule-australia-guide.pdf?ts=b651a135&dl=10-year-tax-rule-australia-guide.pdf", tags: ["tax planning"], shareable: true },
  { title: "Retirement Destinations Attractiveness Report (for UK Nationals) 2025", url: "https://www.datocms-assets.com/137998/1758890257-retirement-emigration-attractiveness-for-britons.pdf?ts=ab20e939&dl=retirement-emigration-attractiveness-for-britons.pdf", tags: ["retirement planning"], shareable: true },
  { title: "What is a Binding Death Benefit Nomination?", url: "https://www.datocms-assets.com/137998/1763028442-what-is-a-binding-death-benefit-nomination.pdf?ts=e80ff375&dl=what-is-a-binding-death-benefit-nomination.pdf", tags: ["financial planning"], shareable: true },
  { title: "Greece Tax Guide", url: "https://www.datocms-assets.com/137998/1763031001-tax-greece.pdf?ts=5bcceea3&dl=tax-greece.pdf", tags: ["tax planning"], shareable: true },
  { title: "Tax Guide Cyprus", url: "https://www.datocms-assets.com/137998/1763061261-tax-cyprus.pdf?ts=9d05fc7f&dl=tax-cyprus.pdf", tags: ["tax planning"], shareable: true },
  { title: "Wills and Estate Planning: Australia", url: "https://www.datocms-assets.com/137998/1763061887-wills-estate-planning-aus.pdf?ts=854b5efa&dl=wills-estate-planning-aus.pdf", tags: ["estate planning"], shareable: true },
  { title: "Retirement Destination Guide: Spain", url: "https://www.datocms-assets.com/137998/1763062436-retirement-destination-guide_spain.pdf?ts=cef099ab&dl=retirement-destination-guide_spain.pdf", tags: ["retirement planning"], shareable: true },
  { title: "Pre-Budget Guide (2025 Edition)", url: "https://www.datocms-assets.com/137998/1763052790-hoxton-pre-budget-guide.pdf?ts=0e466c28&dl=hoxton-pre-budget-guide.pdf", tags: ["financial planning"], shareable: true },
  { title: "Pre-Budget Guide for Expats (2025 Edition)", url: "https://www.datocms-assets.com/137998/1763055918-hoxton-pre-budget-expats.pdf?ts=3d4ddb1d&dl=hoxton-pre-budget-expats.pdf", tags: ["financial planning"], shareable: true },
  { title: "Assets and Liabilities", url: "https://www.datocms-assets.com/137998/1768960727-assets-and-liabilitis-3.pdf?ts=7525e4da&dl=assets-and-liabilitis-3.pdf", tags: ["financial planning"], shareable: true },
  { title: "Retirement Planning for Expats in Asia", url: "https://www.datocms-assets.com/137998/1769497387-retirement-planning-for-exapts-in-asia.pdf?ts=ad624620&dl=retirement-planning-for-exapts-in-asia.pdf", tags: ["retirement planning"], shareable: true },
  { title: "Insurance & Employee Benefits for International Schools", url: "https://www.datocms-assets.com/137998/1769497918-insurance-employee-benefits-folder.pdf?ts=73e2a665&dl=insurance-employee-benefits-folder.pdf", tags: ["employee benefits"], shareable: true },
  { title: "Retirement Planning for Expats in Vietnam", url: "https://www.datocms-assets.com/137998/1769498571-retirement-planning-for-exapts-in-vietnam.pdf?ts=b09e4011&dl=retirement-planning-for-exapts-in-vietnam.pdf", tags: ["retirement planning"], shareable: true },
  { title: "Money Myths, Clarified", url: "https://www.datocms-assets.com/137998/1769498860-money-myths-guide_001.pdf?ts=01414e41&dl=money-myths-guide_001.pdf", tags: ["financial planning"], shareable: true },
  { title: "Worldwide Retirement & Emigration Destinations", url: "https://www.datocms-assets.com/137998/1769500441-us-retirement-destinations-2026-edits.pdf?ts=78abbcb2&dl=us-retirement-destinations-2026-edits.pdf", tags: ["retirement planning"], shareable: true },
  { title: "Worldwide Retirement & Emigration Destinations", url: "https://www.datocms-assets.com/137998/1769577910-us-retirement-destinations-2026-edits-1.pdf?ts=84d3ed7b&dl=us-retirement-destinations-2026-edits-1.pdf", tags: ["retirement planning"], shareable: true },
];

async function seed() {
  const supabase = getSupabase();

  const { data: existing, error: existingError } = await supabase
    .from("assets")
    .select("url");

  if (existingError) {
    throw new Error(`Failed to read existing assets: ${existingError.message}`);
  }

  const existingUrls = new Set((existing ?? []).map((a) => a.url));
  const toInsert = ASSETS.filter((a) => !existingUrls.has(a.url));
  const skipped = ASSETS.length - toInsert.length;

  if (toInsert.length === 0) {
    console.log(`All ${ASSETS.length} assets already present — nothing to insert.`);
    return;
  }

  const rows = toInsert.map((a) => ({
    title: a.title,
    url: a.url,
    description: null,
    tags: a.tags,
    shareable: a.shareable,
  }));

  const { error: insertError } = await supabase.from("assets").insert(rows);
  if (insertError) {
    throw new Error(`Insert failed: ${insertError.message}`);
  }

  console.log(`Inserted ${toInsert.length} assets. Skipped ${skipped} already present.`);
}

seed().catch((err) => {
  console.error("Seed failed:", err);
  process.exit(1);
});
