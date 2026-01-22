
export function generateData(nodeCount, edgeCount) {
    const nodes = new Array(nodeCount);
    const links = new Array(edgeCount);
    
    // Optimization: Reuse string objects for type to save memory
    const typePerson = 'person';
    const typeCompany = 'company';
    const defaultImg = "/src/img2/a0.png";

    // Optimization: Use simple integer IDs converted to string only if necessary by the engine.
    // Assuming engine can handle string IDs, we make them short.
    
    for (let i = 0; i < nodeCount; i++) {
        nodes[i] = {
            id: i.toString(), // Short ID
            // label: `A${i}`, // Short label
            img: defaultImg, 
            data: {
                type: i % 2 === 0 ? typePerson : typeCompany,
                // balance: 100 // Remove random number generation to save allocation/time
            }
        };
    }

    for (let i = 0; i < edgeCount; i++) {
        const sourceIndex = Math.floor(Math.random() * nodeCount);
        let targetIndex = Math.floor(Math.random() * nodeCount);
        while (targetIndex === sourceIndex) {
            targetIndex = Math.floor(Math.random() * nodeCount);
        }

        links[i] = {
            id: (i + nodeCount).toString(), // Ensure unique ID different from nodes
            from: sourceIndex.toString(),
            to: targetIndex.toString(),
            source: sourceIndex.toString(),
            target: targetIndex.toString(),
            type: 'transaction',
            // label: 'T'
        };
    }

    return { nodes, links };
}
