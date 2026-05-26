import { prisma } from '../config/db';

async function main() {
  const merchants = await prisma.merchant.findMany();
  console.log('--- Merchants in Database ---');
  console.log(JSON.stringify(merchants, null, 2));
  console.log(`Total merchants: ${merchants.length}`);
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
