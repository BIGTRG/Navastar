// Navastar demo seed. Idempotent-ish: upserts stable rows by natural keys.
// Run: pnpm db:seed  (after `pnpm db:push` or `pnpm db:migrate`)
import bcrypt from "bcryptjs";
import {
  prisma,
  Role,
  CommodityType,
  AuctionPartnerCode,
  PartyRole,
  CarrierKind,
  DriverType,
  AssetType,
} from "../src/index.js";

const DEMO_PASSWORD = "password123"; // demo only — see docs/BRIEF for prod auth

async function main() {
  console.log("🌱 Seeding Navastar demo data…");
  const passwordHash = await bcrypt.hash(DEMO_PASSWORD, 10);

  // ── Commodities (Live Animals ships OFF; flip ON when ready) ──
  const commodities: Array<{ type: CommodityType; label: string; enabled: boolean; marginBps: number }> = [
    { type: CommodityType.VEHICLE, label: "Vehicles", enabled: true, marginBps: 1500 },
    { type: CommodityType.BOAT, label: "Boats", enabled: true, marginBps: 1800 },
    { type: CommodityType.EQUIPMENT, label: "Heavy Equipment", enabled: true, marginBps: 2000 },
    { type: CommodityType.FREIGHT, label: "Freight", enabled: true, marginBps: 1200 },
    { type: CommodityType.WHITE_GLOVE, label: "White-Glove", enabled: true, marginBps: 2500 },
    { type: CommodityType.HIGH_VALUE, label: "High-Value", enabled: true, marginBps: 2200 },
    { type: CommodityType.LIVE_ANIMALS, label: "Live Animals", enabled: false, marginBps: 3000 },
  ];
  for (const c of commodities) {
    await prisma.commodity.upsert({
      where: { type: c.type },
      update: { label: c.label, enabled: c.enabled, marginBps: c.marginBps },
      create: c,
    });
  }
  const vehicle = await prisma.commodity.findUniqueOrThrow({ where: { type: CommodityType.VEHICLE } });
  console.log(`  ✓ ${commodities.length} commodities (Live Animals OFF)`);

  // ── Handling profiles ──
  const profiles = [
    { commodity: CommodityType.VEHICLE, name: "Standard Auto (open)", requiresEnclosed: false },
    { commodity: CommodityType.VEHICLE, name: "Enclosed Auto", requiresEnclosed: true },
    { commodity: CommodityType.HIGH_VALUE, name: "High-Value Enclosed", requiresEnclosed: true },
    { commodity: CommodityType.BOAT, name: "Trailered Boat", requiresLiftgate: false },
    { commodity: CommodityType.EQUIPMENT, name: "Flatbed Equipment", requiresLiftgate: true },
    { commodity: CommodityType.WHITE_GLOVE, name: "White-Glove Delivery", requiresLiftgate: true },
    { commodity: CommodityType.LIVE_ANIMALS, name: "Livestock (disabled)", liveCargo: true },
  ];
  // profiles have no natural unique key; seed only if empty
  if ((await prisma.handlingProfile.count()) === 0) {
    await prisma.handlingProfile.createMany({ data: profiles });
  }
  console.log(`  ✓ handling profiles`);

  // ── Auction partners (launch: BidNow, Auctora, Auction of America; + majors) ──
  const partners: Array<{ code: AuctionPartnerCode; name: string }> = [
    { code: AuctionPartnerCode.BIDNOW, name: "BidNow" },
    { code: AuctionPartnerCode.AUCTORA, name: "Auctora" },
    { code: AuctionPartnerCode.AUCTION_OF_AMERICA, name: "Auction of America" },
    { code: AuctionPartnerCode.COPART, name: "Copart" },
    { code: AuctionPartnerCode.IAA, name: "IAA" },
    { code: AuctionPartnerCode.MANHEIM, name: "Manheim" },
    { code: AuctionPartnerCode.ADESA, name: "ADESA" },
  ];
  for (const p of partners) {
    await prisma.auctionPartner.upsert({
      where: { code: p.code },
      update: { name: p.name },
      create: { ...p, apiKey: `demo-key-${p.code.toLowerCase()}` },
    });
  }
  console.log(`  ✓ ${partners.length} auction partners`);

  // ── Users, one per role ──
  const users: Array<{ email: string; name: string; roles: Role[] }> = [
    { email: "buyer@demo.navastar", name: "Casey Buyer", roles: [Role.customer] },
    { email: "carrier@demo.navastar", name: "Ravi Carrier", roles: [Role.independent_carrier] },
    { email: "driver@demo.navastar", name: "Dana Driver", roles: [Role.employee_driver] },
    { email: "leaseop@demo.navastar", name: "Leo Lease", roles: [Role.lease_operator] },
    { email: "dispatch@demo.navastar", name: "Dot Dispatch", roles: [Role.dispatcher] },
    { email: "qa@demo.navastar", name: "Quinn QA", roles: [Role.qa_reviewer] },
    { email: "admin@demo.navastar", name: "Alex Admin", roles: [Role.admin, Role.dispatcher] },
    { email: "partner@demo.navastar", name: "Pat Partner", roles: [Role.auction_partner] },
    { email: "lessor@demo.navastar", name: "Elle Lessor", roles: [Role.equipment_lessor] },
  ];
  const userByEmail: Record<string, string> = {};
  for (const u of users) {
    const rec = await prisma.user.upsert({
      where: { email: u.email },
      update: { name: u.name, roles: u.roles, passwordHash },
      create: { email: u.email, name: u.name, roles: u.roles, passwordHash },
    });
    userByEmail[u.email] = rec.id;
  }
  console.log(`  ✓ ${users.length} users (password: "${DEMO_PASSWORD}")`);

  // ── A carrier with drivers + assets ──
  const carrier = await prisma.carrier.upsert({
    where: { dotNumber: "1234567" },
    update: {},
    create: {
      kind: CarrierKind.INDEPENDENT,
      legalName: "Roadrunner Transport LLC",
      dba: "Roadrunner",
      dotNumber: "1234567",
      mcNumber: "MC-987654",
      authorityActive: true,
      safetyScore: 88,
      trustScore: 82,
    },
  });

  const employeeDriver = await prisma.driver.upsert({
    where: { userId: userByEmail["driver@demo.navastar"] },
    update: {},
    create: {
      type: DriverType.EMPLOYEE_W2,
      name: "Dana Driver",
      phone: "+1-555-0101",
      licenseNo: "D1234567",
      licenseState: "TX",
      trustScore: 90,
      userId: userByEmail["driver@demo.navastar"],
      lastLat: 32.7767,
      lastLng: -96.797,
      lastSeenAt: new Date(),
    },
  });

  if ((await prisma.driver.count()) < 2) {
    await prisma.driver.create({
      data: {
        type: DriverType.INDEPENDENT,
        name: "Rio Contractor",
        phone: "+1-555-0202",
        carrierId: carrier.id,
        trustScore: 78,
        lastLat: 33.4484,
        lastLng: -112.074,
        lastSeenAt: new Date(),
      },
    });
  }

  if ((await prisma.asset.count()) === 0) {
    await prisma.asset.createMany({
      data: [
        { type: AssetType.CAR_HAULER, label: "9-car open hauler", plate: "TX-CAR9", capacity: 9, carrierId: carrier.id },
        { type: AssetType.ENCLOSED, label: "2-car enclosed", plate: "TX-ENC2", capacity: 2, carrierId: carrier.id },
      ],
    });
  }
  console.log(`  ✓ carrier + drivers + assets`);

  // ── A couple of demo auction lots (won lots ready to ship) ──
  const bidnow = await prisma.auctionPartner.findUniqueOrThrow({ where: { code: AuctionPartnerCode.BIDNOW } });
  const demoLots = [
    {
      externalLotId: "BN-2024-00123",
      vin: "1HGCM82633A004352",
      make: "Honda",
      model: "Accord EX",
      year: 2019,
      title: "2019 Honda Accord EX",
      salePriceCents: 1785000,
      buyerName: "Casey Buyer",
      buyerEmail: "buyer@demo.navastar",
      location: "Dallas, TX",
      lat: 32.7767,
      lng: -96.797,
    },
    {
      externalLotId: "BN-2024-00987",
      vin: "5YJ3E1EA7KF317654",
      make: "Tesla",
      model: "Model 3 LR",
      year: 2020,
      title: "2020 Tesla Model 3 Long Range",
      salePriceCents: 2990000,
      buyerName: "Casey Buyer",
      buyerEmail: "buyer@demo.navastar",
      location: "Phoenix, AZ",
      lat: 33.4484,
      lng: -112.074,
    },
  ];
  for (const lot of demoLots) {
    await prisma.auctionLot.upsert({
      where: { partnerId_externalLotId: { partnerId: bidnow.id, externalLotId: lot.externalLotId } },
      update: {},
      create: { partnerId: bidnow.id, ...lot },
    });
  }
  console.log(`  ✓ ${demoLots.length} demo auction lots (BidNow)`);

  // Referenced above; kept for clarity that these anchor demo shipments/legs.
  void vehicle;
  void employeeDriver;

  console.log("✅ Seed complete.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
