import { initializeApp } from 'firebase/app';
import { getAuth, createUserWithEmailAndPassword } from 'firebase/auth';
import { getFirestore, collection, doc, setDoc, serverTimestamp } from 'firebase/firestore';

const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

async function seedData() {
  console.log('Starting seed data...');

  try {
    console.log('\n1. Creating users...');
    const users = [
      { email: 'admin@celestar.com', password: 'admin123', role: 'admin' },
      { email: 'supervisor@celestar.com', password: 'supervisor123', role: 'supervisor' },
      { email: 'client@celestar.com', password: 'client123', role: 'client' },
    ];

    for (const user of users) {
      try {
        const userCredential = await createUserWithEmailAndPassword(
          auth,
          user.email,
          user.password
        );
        await setDoc(doc(db, 'users', userCredential.user.uid), {
          uid: userCredential.user.uid,
          email: user.email,
          role: user.role,
          orgId: 'org_celestar_001',
          createdAt: serverTimestamp(),
        });
        console.log(`✓ Created user: ${user.email}`);
      } catch (error: any) {
        if (error.code === 'auth/email-already-in-use') {
          console.log(`- User already exists: ${user.email}`);
        } else {
          console.error(`✗ Error creating user ${user.email}:`, error.message);
        }
      }
    }

    console.log('\n2. Creating project...');
    const projectId = 'proj_loreal_pilot_001';
    await setDoc(doc(db, 'projects', projectId), {
      id: projectId,
      name: "L'Oréal Mall Fit-Out (Pilot)",
      brand: "L'Oréal KSA",
      agency: 'Ten Star Group',
      location: 'Riyadh • Mall',
      startDate: '2026-01-05',
      createdAt: serverTimestamp(),
    });
    console.log('✓ Created project');

    console.log('\n3. Creating zones...');
    const zones = [
      {
        id: 'zone_structure',
        name: 'Structure & Carpentry',
        deliverable: 'All panels installed with dimensions matching drawing',
        owner: 'BuildMaster Ltd',
        status: 'RED',
        criteria: [
          'All panels installed',
          'Dimensions match drawing (visual)',
          'Edges finished (no raw splinters)',
          'Stable & safe',
        ],
      },
      {
        id: 'zone_paint',
        name: 'Paint & Finish',
        deliverable: 'Uniform coat with brand colors matched',
        owner: 'ColorPro Services',
        status: 'AMBER',
        criteria: [
          'Uniform coat',
          'Brand colors matched',
          'Dry-to-touch',
          'No drips/stains',
        ],
      },
      {
        id: 'zone_electrical',
        name: 'Electrical & Lighting',
        deliverable: 'Fixtures installed, powered, and tested',
        owner: 'BrightWorks Electric',
        status: 'GREEN',
        criteria: [
          'Fixtures installed & powered',
          'No exposed wiring',
          'Lighting test video',
          'Safety check',
        ],
      },
      {
        id: 'zone_storage',
        name: 'Warehouse Storage Readiness',
        deliverable: 'Components labeled and packed',
        owner: 'LogiStore',
        status: 'AMBER',
        criteria: [
          'Components labeled',
          'Packed to prevent damage',
          'Inventory photo set',
          'Load plan confirmed',
        ],
      },
      {
        id: 'zone_transport',
        name: 'Transport Readiness',
        deliverable: 'Vehicle assigned and loading confirmed',
        owner: 'FastMove Logistics',
        status: 'RED',
        criteria: [
          'Vehicle assigned',
          'Departure confirmed',
          'Loading complete (photo)',
          'Arrival verified (photo)',
        ],
      },
      {
        id: 'zone_signage',
        name: 'Signage & Branding',
        deliverable: 'Brand signage installed and verified',
        owner: 'SignCraft',
        status: 'GREEN',
        criteria: [
          'Brand logo positioned correctly',
          'No spelling errors',
          'Lighting functional',
          'Photo documentation',
        ],
      },
      {
        id: 'zone_flooring',
        name: 'Flooring',
        deliverable: 'Floor finished and cleaned',
        owner: 'FloorPro',
        status: 'AMBER',
        criteria: [
          'Surface level',
          'No gaps or cracks',
          'Cleaned and polished',
          'Protection installed',
        ],
      },
      {
        id: 'zone_fixtures',
        name: 'Display Fixtures',
        deliverable: 'Product displays installed',
        owner: 'DisplayMax',
        status: 'GREEN',
        criteria: [
          'All shelves installed',
          'Weight tested',
          'Aligned properly',
          'Lighting integrated',
        ],
      },
    ];

    for (const zone of zones) {
      await setDoc(doc(db, 'zones', zone.id), {
        id: zone.id,
        projectId,
        name: zone.name,
        deliverable: zone.deliverable,
        owner: zone.owner,
        status: zone.status,
        lastVerifiedAt: null,
        nextVerificationAt: null,
        acceptanceCriteria: zone.criteria,
        isEscalated: false,
        escalationLevel: null,
      });
      console.log(`✓ Created zone: ${zone.name}`);
    }

    console.log('\n✅ Seed data completed successfully!');
    console.log('\nDemo accounts:');
    console.log('Admin: admin@celestar.com / admin123');
    console.log('Supervisor: supervisor@celestar.com / supervisor123');
    console.log('Client: client@celestar.com / client123');
  } catch (error) {
    console.error('\n❌ Error seeding data:', error);
  }

  process.exit(0);
}

seedData();
