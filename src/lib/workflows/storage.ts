// src/lib/workflows/storage.ts
//
// Plain Firestore CRUD for saved workflows, under users/{uid}/workflows/{id}.
// This file does NOT check the user's plan - that's deliberate. Gating
// belongs at the call site (see src/lib/plan/gating.ts's
// checkCanSaveWorkflow), so this module stays a dumb, reusable data layer
// rather than duplicating plan logic here too.
import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDocs,
  orderBy,
  query,
  updateDoc,
} from 'firebase/firestore';
import { db } from '../../firebase';
import type { Workflow } from './types';

function requireDb() {
  if (!db) throw new Error('Firestore is not initialized - check your Firebase config.');
  return db;
}

export async function saveWorkflow(uid: string, workflow: Workflow): Promise<string> {
  const firestore = requireDb();
  const now = Date.now();

  if (workflow.id) {
    const ref = doc(firestore, 'users', uid, 'workflows', workflow.id);
    await updateDoc(ref, { name: workflow.name, steps: workflow.steps, updatedAt: now });
    return workflow.id;
  }

  const ref = await addDoc(collection(firestore, 'users', uid, 'workflows'), {
    name: workflow.name,
    steps: workflow.steps,
    createdAt: now,
    updatedAt: now,
  });
  return ref.id;
}

export async function listWorkflows(uid: string): Promise<Workflow[]> {
  const firestore = requireDb();
  const workflowsQuery = query(collection(firestore, 'users', uid, 'workflows'), orderBy('updatedAt', 'desc'));
  const snapshot = await getDocs(workflowsQuery);
  return snapshot.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<Workflow, 'id'>) }));
}

export async function deleteWorkflow(uid: string, id: string): Promise<void> {
  const firestore = requireDb();
  await deleteDoc(doc(firestore, 'users', uid, 'workflows', id));
}
