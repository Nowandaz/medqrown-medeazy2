import { pool } from "../server/db";

// Approved review copy. This is an intentional one-time publication script,
// not a startup seed: later edits in the admin editor must never be replaced.
const answers = [
  {
    id: 5,
    question: "Outline the path of the corticospinal tract from motor cortex to anterior horn cell, noting where it decussates. (5 marks)",
    modelAnswer: "Upper motor neuron axons arise chiefly from the primary motor cortex (precentral gyrus). They converge through the corona radiata and descend in the posterior limb of the internal capsule, then through the cerebral peduncles of the midbrain, ventral pons and medullary pyramids. Most fibers cross in the pyramidal decussation of the **caudal medulla** and descend as the lateral corticospinal tract. At the appropriate spinal level they terminate on interneurons or directly on lower motor neurons in the anterior horn. A smaller uncrossed anterior corticospinal component crosses near its segmental termination.",
    markingPoints: "1. Origin in primary motor cortex and convergence through corona radiata.\n2. Posterior limb of internal capsule.\n3. Brainstem course: cerebral peduncle, ventral pons and medullary pyramid.\n4. Pyramidal decussation in the caudal medulla; lateral corticospinal descent.\n5. Termination at the spinal level on interneurons and/or anterior horn motor neurons.",
  },
  {
    id: 6,
    question: "Describe the boundaries and contents of the anatomical snuffbox. (4 marks)",
    modelAnswer: "The anatomical snuffbox is the triangular depression on the dorsolateral wrist seen with thumb extension. Its lateral (radial) border is formed by the tendons of abductor pollicis longus and extensor pollicis brevis; its medial (ulnar) border is the extensor pollicis longus tendon. The floor is formed chiefly by the scaphoid and trapezium bones. The **radial artery** traverses the snuffbox over the floor. The superficial branch of the radial nerve and the cephalic vein lie in its roof/superficial fascia, rather than alongside the artery on the floor.",
    markingPoints: "1. Radial border: abductor pollicis longus and extensor pollicis brevis tendons.\n2. Ulnar border: extensor pollicis longus tendon.\n3. Floor: scaphoid and trapezium.\n4. Radial artery on the floor, with superficial radial nerve and cephalic vein in the roof.",
  },
  {
    id: 7,
    question: "List the structures that pass through the diaphragm at T8, T10, and T12, and state one clinical relevance of the aortic hiatus (T12). (4 marks)",
    modelAnswer: "At **T8**, the caval opening transmits the inferior vena cava and branches of the right phrenic nerve. At **T10**, the esophageal hiatus transmits the esophagus and anterior/posterior vagal trunks (and small esophageal vessels). At **T12**, the aortic hiatus transmits the descending aorta, thoracic duct and commonly the azygos vein. Clinically, the aorta passes behind the diaphragm under the median arcuate ligament, so diaphragmatic contraction does not constrict aortic flow at this hiatus.",
    markingPoints: "1. T8: inferior vena cava (with right phrenic nerve branches).\n2. T10: esophagus and vagal trunks.\n3. T12: aorta and thoracic duct (with azygos vein).\n4. Clinical relevance: aortic flow is not compressed by diaphragmatic contraction because the hiatus is posterior to the diaphragm.",
  },
  {
    id: 11,
    question: "Explain the rationale for the Cori cycle and name the two organs involved. (4 marks)",
    modelAnswer: "The two principal organs are **skeletal muscle and liver**. During intense activity, muscle converts glucose to lactate by anaerobic glycolysis, regenerating NAD+ so glycolysis can continue supplying ATP. Lactate travels through the blood to the liver, where it is converted back to glucose by gluconeogenesis using hepatic energy. Glucose returns through the blood to muscle for reuse. The cycle sustains muscle energy production during limited oxygen availability and shifts the cost of recycling lactate to the liver. Red blood cells also contribute lactate, but are not one of the two organs requested.",
    markingPoints: "1. Names both skeletal muscle and liver.\n2. Muscle produces lactate from glucose during anaerobic glycolysis.\n3. Blood carries lactate to liver; hepatic gluconeogenesis converts it to glucose.\n4. Glucose returns to muscle, supporting continued glycolysis and lactate recycling.",
  },
  {
    id: 12,
    question: "Outline the mechanism by which insulin promotes glycogen synthesis, naming the key enzyme activated. (4 marks)",
    modelAnswer: "Insulin binds its receptor tyrosine kinase, stimulating insulin receptor substrate (IRS)–PI3K–Akt signaling. Akt inhibits glycogen synthase kinase 3 (GSK3), reducing inhibitory phosphorylation of **glycogen synthase**. Insulin signaling also favors protein phosphatase 1–mediated dephosphorylation and activation of glycogen synthase, the key enzyme that adds glucose units from UDP-glucose to glycogen. In skeletal muscle, insulin also promotes GLUT4 translocation, increasing glucose availability for storage.",
    markingPoints: "1. Insulin receptor tyrosine kinase initiates IRS/PI3K/Akt signaling.\n2. Akt inhibits GSK3.\n3. Reduced inhibitory phosphorylation/dephosphorylation activates glycogen synthase.\n4. Correctly names glycogen synthase as the key activated enzyme and relates this to glycogen formation. Accept GLUT4-mediated glucose uptake as supporting context, not a substitute for the enzyme.",
  },
  {
    id: 13,
    question: "Outline the mechanism by which insulin promotes glycogen synthesis, naming the key enzyme activated. (4 marks)",
    modelAnswer: "Insulin activates its receptor tyrosine kinase and the downstream IRS–PI3K–Akt pathway. Akt suppresses GSK3, which would otherwise inhibit glycogen synthase by phosphorylation. Protein phosphatase 1–associated dephosphorylation favors **active glycogen synthase**; this enzyme incorporates glucose from UDP-glucose into glycogen. In muscle, insulin-dependent GLUT4 recruitment supplies more intracellular glucose for the pathway.",
    markingPoints: "1. Receptor tyrosine kinase and IRS–PI3K–Akt pathway.\n2. Akt inhibition of GSK3.\n3. Dephosphorylation activates glycogen synthase.\n4. Names glycogen synthase and describes glycogen production.",
  },
] as const;

async function main() {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    for (const answer of answers) {
      const updated = await client.query(
        `UPDATE demo_questions
            SET model_answer = $1, marking_points = $2
          WHERE id = $3 AND content = $4 AND type = 'saq'
            AND model_answer IS NULL AND marking_points IS NULL
          RETURNING id`,
        [answer.modelAnswer, answer.markingPoints, answer.id, answer.question]
      );
      if (updated.rowCount !== 1) {
        throw new Error(`Question ${answer.id} was missing, changed, or already authored; no answers were published.`);
      }
    }
    await client.query("COMMIT");
    console.log(`Published ${answers.length} approved demo model answers and marking schemes.`);
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});