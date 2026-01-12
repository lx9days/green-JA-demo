import * as d3 from 'd3';
import * as d3Simple from "d3-force-sampled"
import dagre from 'dagre';
//import NetWorkBackEnd from './network_backend';
import { BFSTree } from '../helper/util'
import dynamicPos from '../helper/dynamicPosition';

export default class PositionController {
    constructor(netGraph, { width, height }) {
        this.netGraph = netGraph;
        this.canvasCenter = {
            x: width / 2,
            y: height / 2
        };
        this.offset = {
            x: 0,
            y: 0
        };
        //this.netWorkBackEnd = new NetWorkBackEnd();
        this.force = null

        this.useLayout = 'square';
        this._mapType = {
            importLayout: this.importLayout,
            square: this.square,
            star: this.star,
            circleShape: this.circleShape,
            multSquare: this.multSquare,
            oneRow: this.oneRow,
            oneColumn: this.oneColumn,
            timeSequential: this.timeSequential,
            hierarchy: this.hierarchy,
            dagre: this.dagre,
            auto: this.auto,
            autoCombined: this.autoCombined,
            preset: this.preset
        }
    }

    preset(nodes) {
        if (nodes.length > 0) {
            nodes.forEach(node => {
                if (node.data && node.data.x !== undefined && node.data.y !== undefined) {
                    node.x = node.data.x;
                    node.y = node.data.y;
                }
            });
            let nodeIds = nodes.map(n => n.id);
            this.netGraph.controller.eventController.fire("_updateEntityPosition", [nodeIds, true])
        }
    }

    layout(flag = null) {
        if (flag == "add") {
            return this._mapType["square"].bind(this);
        } else {
            return this._mapType[this.useLayout].bind(this);
        }
    }
    setCanvasCenter({ width, height }) {
        this.canvasCenter = {
            x: width / 2,
            y: height / 2
        }
    }

    setLayout(layoutName, isCombined = false) {
        if (layoutName !== "auto") {
            if (this.force) {
                this.force.stop();
            }
        }
        if (layoutName === "auto" && isCombined) {
            this.useLayout = "autoCombined";
        } else if (layoutName != null) {
            this.useLayout = layoutName;
        }
    }

    importLayout(nodes) {
        if (nodes.length > 0) {
            nodes.forEach(node => {
                node.x = this.netGraph.backupNodeLayout.get(node.id).x;
            node.y = this.netGraph.backupNodeLayout.get(node.id).y;
            })
            // let nodeIds = [];
            // let rowNum = Math.ceil(Math.sqrt(nodes.length));
            // let node1 = nodes[0];
            // if (node1) {
            //     this.offset.x += (Math.random() - 0.5) * 200;
            //     this.offset.y += (Math.random() - 0.5) * 200;

            //     node1.x = ((this.canvasCenter.x - rowNum * 100 / 2) || 0) + this.offset.x;
            //     node1.y = ((this.canvasCenter.y - rowNum * 100 / 2) || 0) + this.offset.y;

            // }
            // let col = 0;
            // let row = 0;
            // for (let i = 0; i < nodes.length; i++) {
            //     let node = nodes[i];
            //     let nodeId = node.id;
            //     nodeIds.push(nodeId);
            //     if(this.netGraph.getIdMapNode().get(nodeId).data.x && this.netGraph.getIdMapNode().get(nodeId).data.y) {
            //         node.x = this.netGraph.getIdMapNode().get(nodeId).data.x;
            //         node.y = this.netGraph.getIdMapNode().get(nodeId).data.y;
            //     } else {
            //         node.x = node1.x + col * 100;
            //         node.y = node1.y + row * 100;
            //         col++;
            //     }
            //     if (col >= rowNum) {
            //         col = 0;
            //         row++;
            //     }
            // }
            this.netGraph.controller.eventController.fire("_updateEntityPosition", [nodes.map(n => n.id), true])
        }
    };

    square(nodes, flag) {
        if (nodes.length > 0) {
            let nodeIds = [];
            let rowNum = Math.ceil(Math.sqrt(nodes.length));
            let node1 = nodes[0];
            if (node1) {
                this.offset.x += (Math.random() - 0.5) * 200;
                this.offset.y += (Math.random() - 0.5) * 200;

                node1.x = ((this.canvasCenter.x - rowNum * 100 / 2) || 0) + this.offset.x;
                node1.y = ((this.canvasCenter.y - rowNum * 100 / 2) || 0) + this.offset.y;

            }
            if (flag == "add") {
                node1.x = this.netGraph.getSelectedNodes()[0].x + 50;
                node1.y = this.netGraph.getSelectedNodes()[0].y + 50;
            }
            let col = 0;
            let row = 0;
            for (let i = 0; i < nodes.length; i++) {
                let node = nodes[i];
                let nodeId = node.id;
                nodeIds.push(nodeId);
                node.x = node1.x + col * 150;
                node.y = node1.y + row * 150;
                col++;
                if (col >= rowNum) {
                    col = 0;
                    row++;
                }
            }
            this.netGraph.controller.eventController.fire("_updateEntityPosition", [nodeIds, true])
        }
    }

    layoutBubbleSet(regions) {

        if (!Array.isArray(regions) || regions.length < 0) {
            return
        }
        let nodeIds = [];

        regions.forEach((region, i) => {
            const bubbles = region.getBubbles();
            const curPos = { x: 0, y: 0 };
            bubbles.forEach((bubble, ind) => {
                const nodes = bubble.getOriginNodes();
                if (nodes.length > 0) {

                    let rowNum = Math.ceil(Math.sqrt(nodes.length));
                    let node1 = nodes[0];
                    let col = 0;
                    let row = 0;
                    for (let i = 0; i < nodes.length; i++) {
                        let node = nodes[i];
                        let nodeId = node.id;
                        nodeIds.push(nodeId);
                        if (ind === 0) {
                            node.x = node1.x + col * 100;
                            node.y = node1.y + row * 100;
                        } else {
                            node.x = curPos.x + col * 100;
                            node.y = curPos.y + row * 100;
                        }

                        col++;
                        if (col >= rowNum) {
                            col = 0;
                            row++;
                        }
                    }
                    if (ind === 0) {
                        curPos.x = node1.x + (rowNum + 1) * 100;
                        curPos.y = node1.y;
                    } else {
                        curPos.x = curPos.x + (rowNum + 1) * 100;
                    }

                }
                bubble.reCompute();
            });

        });
        this.netGraph.controller.eventController.fire("_updateEntityPosition", [nodeIds, false])

    }

    star(selectedNodes) {
        //console.log(this);
        if (selectedNodes.length > 0) {
            let coreNum = selectedNodes.length;
            let nodeIds = [];
            let linkIds = [];
            let mapNodeIdToLinkIds = this.netGraph.getIdMapNode();
            let linkList = this.netGraph.getLinks();
            //let nodeList = this.netGraph.getNodes();
            let ringNodes = [];
            selectedNodes.forEach((node) => {
                linkList.forEach((link) => {
                    if (link.data.from == node.id && !ringNodes.includes(link.data.to)) {
                        ringNodes.push(link.data.to);
                    } else if (link.data.to == node.id && !ringNodes.includes(link.data.from)) {
                        ringNodes.push(link.data.from);
                    }
                });
            });
            ringNodes.forEach((d) => {
                if (!selectedNodes.includes(mapNodeIdToLinkIds.get(d))) {
                    selectedNodes.push(mapNodeIdToLinkIds.get(d));
                }
            })
            //console.log(selectedNodes);
            let baseNode = selectedNodes[0];
            let baseX = baseNode.x ? baseNode.x : 0;
            let baseY = baseNode.y ? baseNode.y : 0;
            let insideR = 0;//圈半径
            let outsideR = 0;
            if (coreNum > selectedNodes.length - coreNum) {
                insideR = (100 * coreNum) / (2 * Math.PI);
                outsideR = 2 * insideR;
            } else {
                outsideR = (100 * (selectedNodes.length - coreNum)) / (2 * Math.PI);
                insideR = outsideR / 2;
            }
            let insideRoate = (2 * Math.PI) / (coreNum > 0 ? coreNum : 1);
            let outsideRoate = (2 * Math.PI) / ((selectedNodes.length - coreNum) > 0 ? (selectedNodes.length - coreNum) : 1);
            //let outNodes = [];

            selectedNodes.forEach((node, index) => {
                if (index >= coreNum) {
                    let id = node.id;
                    if (mapNodeIdToLinkIds.has(node.id)) {
                        let rLinkObj = mapNodeIdToLinkIds.get(node.id);
                        rLinkObj.sourceLinks.forEach((link) => {
                            if (linkIds.indexOf(link.id) === -1) {
                                linkIds.push(link.id);
                            }
                        });
                        rLinkObj.targetLinks.forEach((link) => {
                            if (linkIds.indexOf(link.id) === -1) {
                                linkIds.push(link.id);
                            }
                        });
                        nodeIds.push(id);
                        node.x = baseX + Math.sin(outsideRoate * index) * outsideR;
                        node.y = baseY + Math.cos(outsideRoate * index) * outsideR;
                    } else {
                        node.x = 0;
                        node.y = 0;
                    }
                } else {
                    let id = node.id;
                    if (mapNodeIdToLinkIds.has(node.id)) {
                        let rLinkObj = mapNodeIdToLinkIds.get(node.id);
                        rLinkObj.sourceLinks.forEach((link) => {
                            if (linkIds.indexOf(link.id) === -1) {
                                linkIds.push(link.id);
                            }
                        });
                        rLinkObj.targetLinks.forEach((link) => {
                            if (linkIds.indexOf(link.id) === -1) {
                                linkIds.push(link.id);
                            }
                        });
                        nodeIds.push(id);
                        node.x = baseX + Math.sin(insideRoate * index) * insideR;
                        node.y = baseY + Math.cos(insideRoate * index) * insideR;
                    } else {
                        node.x = 0;
                        node.y = 0;
                    }
                }
            });

            // if (linkIds.length > 0) {
            //     outsideR = (100 * outNodes.length) / (2 * Math.PI);
            //     outsideR = 0;
            //     outsideRoate = (2 * Math.PI) / outNodes.length;
            //     outsideRoate = 0;
            //     outNodes.forEach((node, index) => {
            //         node.x = baseX + Math.sin(outsideRoate * index) * outsideR;
            //         node.y = baseY + Math.cos(outsideRoate * index) * outsideR;
            //     });
            // }
            this.netGraph.controller.eventController.fire("_updateEntityPosition", [nodeIds, true]);
            this.netGraph.updateNodeStatus(nodeIds, 2);
        }
    }

    circleShape(nodes) {
        if (nodes.length > 0) {
            let nodeIds = [];
            let ringNum = 300;//最内圈容纳节点数最多为500
            let alreadyInRing = 0;
            if (nodes.length < ringNum) {
                ringNum = nodes.length;
            }
            let radius = (ringNum * 150) / (2 * Math.PI);
            let avd = 360 / ringNum;
            let ahd = (avd * Math.PI) / 180;
            let no1 = nodes[0];
            no1.x = no1.x || 0;
            no1.y = no1.y || 0;
            let ringCount = 0;
            let shift = 100;
            while (alreadyInRing < nodes.length) {
                for (let i = alreadyInRing; i < alreadyInRing + ringNum && i < nodes.length; i++) {
                    let no = nodes[i];
                    if (i == 9999 || i == 10000) {
                        console.log(no);
                        console.log(no.id);
                    }
                    nodeIds.push(no.id);
                    no.x = no1.x + Math.sin(ahd * i) * radius;
                    no.y = no1.y - radius + ringCount * shift + Math.cos(ahd * i) * radius;
                }
                //console.log(alreadyInRing);
                ringCount++;
                alreadyInRing += ringNum;
                radius += shift;
                avd = 360 / ringNum;
                ahd = (avd * Math.PI) / 180;
            }


            this.netGraph.controller.eventController.fire("_updateEntityPosition", [nodeIds, true])
        }

    }

    multSquare(nodes) {
        let no1x = 0;
        let no1y = 0;
        if (nodes.length > 0) {
            no1x = nodes[0].x || 0;
            no1y = nodes[0].y || 0;
            const nodeIds = new Array();
            const typeMap = new Map();
            nodes.map(item => {
                let type = item.data.metaType;///
                if (typeMap.has(type)) {
                    typeMap.get(type).push(item);
                } else {
                    typeMap.set(type, [item]);
                }
                nodeIds.push(item.getId());
            });

            Array.from(typeMap.keys()).forEach((v, i) => {
                const nodeArray = typeMap.get(v);
                let rowNum = Math.ceil(Math.sqrt(nodeArray.length));
                let col = 0;
                let row = 0;
                for (let i = 0; i < nodeArray.length; i++) {
                    let no = nodeArray[i];
                    //用户交互锁？？？
                    no.x = no1x + col * 100;
                    no.y = no1y + row * 100;
                    col++;
                    if (col > rowNum) {
                        col = 0;
                        row++;
                    }
                }
                let heightNum = parseInt(nodeArray.length / rowNum);
                no1y = no1y + heightNum * 100 + 200;
            });
            this.netGraph.controller.eventController.fire("_updateEntityPosition", [nodeIds, true])
        }


    }

    oneRow(nodes) {
        if (nodes.length > 0) {
            let nodeIds = [];
            let no1 = nodes[0];
            no1.x = no1.x || 0;
            no1.y = no1.y || 0;
            nodes.forEach((node, i) => {
                nodeIds.push(node.id);
                node.x = no1.x + i * 150;
                node.y = no1.y;
            });
            this.netGraph.controller.eventController.fire("_updateEntityPosition", [nodeIds, true])
        }

    }

    oneColumn(nodes) {
        if (nodes.length > 0) {
            let nodeIds = [];
            let no1 = nodes[0];
            no1.x = no1.x || 0;
            no1.y = no1.y || 0;
            nodes.forEach((node, i) => {
                nodeIds.push(node.id);
                node.x = no1.x;
                node.y = no1.y + i * 150;
            });
            this.netGraph.controller.eventController.fire("_updateEntityPosition", [nodeIds, true])
        }

    }

    auto(nodes, srclinks = null) {
        const nodeIdToIndex = {};
        nodes.forEach((item, index) => {
            nodeIdToIndex[item.id] = index + 1;
        })
        const nodeIds = nodes.map(node => node.id)
        let links = [];
        if (srclinks) {
            links = srclinks;
        } else if (this.netGraph) {
            links = this.netGraph.getLinks();
        } else {
            links = [];
        }

        const linkST = [];
        links.forEach(link => {
            const fromId = link.data.from || link.data.source;
            const toId = link.data.to || link.data.target;
            if (nodeIdToIndex[fromId] && nodeIdToIndex[toId]) {
                linkST.push({
                    source: nodeIdToIndex[fromId] - 1,
                    target: nodeIdToIndex[toId] - 1,
                    value: link.data.value || 1
                });
            }
        });

        // Create groups of nodes with same properties
        const nodeGroups = {};
        nodes.forEach(node => {
            const properties = node.data.properties || {};
            Object.entries(properties).forEach(([key, value]) => {
                if(key !== 'platform')return; // 只对平台进行分组

                const groupKey = `${key}_${value}`;
                if (!nodeGroups[groupKey]) {
                    nodeGroups[groupKey] = [];
                }
                nodeGroups[groupKey].push(node);
            });
        });

        // Calculate max value for normalization
        let maxVal = 1;
        nodes.forEach(n => {
            if (n.data.value && n.data.value > maxVal) maxVal = n.data.value;
        });

        // Helper to get ratio (0-1)
        const getRatio = (val) => {
            if (!val) return 0;
            return Math.min(1, Math.max(0, val / maxVal));
        };

        this.force = d3.forceSimulation(nodes)
            .force("charge", d3.forceManyBody().strength(d => {
                // Base repulsion -300
                // Exclude core nodes from dynamic repulsion
                // if (d.data.isCore || d.data.type === 'core') {
                //     return -3000;
                // }
                // const ratio = getRatio(d.data.value);
                // return -5000*(ratio+1); 
                return -1000
            }))
            .force("core-repulsion", (alpha) => {
                 // Custom force: Only apply repulsion between core nodes
                 const coreNodes = nodes.filter(n => n.data.isCore || n.data.type === 'core');
                 const strength = 1.5; // Adjust strength as needed
                 
                 for (let i = 0; i < coreNodes.length; ++i) {
                     for (let j = i + 1; j < coreNodes.length; ++j) {
                         const source = coreNodes[i];
                         const target = coreNodes[j];
                         
                         let x = target.x - source.x || (Math.random() - 0.5);
                         let y = target.y - source.y || (Math.random() - 0.5);
                         let l = Math.sqrt(x * x + y * y);
                         
                         // Apply force if nodes are too close (e.g., within 500px)
                         // Or apply globally with inverse square law like standard charge
                         if (l < 2000) { 
                             l = (l - 2000) / l * alpha * strength;
                             x *= l;
                             y *= l;
                             
                             target.vx -= x;
                             target.vy -= y;
                             source.vx += x;
                             source.vy += y;
                         }
                     }
                 }
            })
            .force("link", d3.forceLink(linkST)
                .distance(link => {
                    const sRatio = getRatio(link.source.data.value);
                    const tRatio = getRatio(link.target.data.value);
                    const combinedRatio = (sRatio + tRatio) / 2; // Average ratio 0-1
                    
                    // The higher the intimacy, the closer (smaller distance)
                    return 1300 * (1-combinedRatio)*(1-combinedRatio);
                })
                .strength(link => {
                    const sRatio = getRatio(link.source.data.value);
                    const tRatio = getRatio(link.target.data.value);
                    const combinedRatio = (sRatio + tRatio) / 2; // Average ratio 0-1
                    return 0.3*combinedRatio;
                })
            )
            .force("center", d3.forceCenter(this.canvasCenter.x, this.canvasCenter.y))

            
        // Switch for platform attraction
        if (true) {
            // Add attraction forces between nodes with same properties
            Object.values(nodeGroups).forEach(group => {
                if (group.length > 1) {
                    const force = d3.forceManyBody()
                        .strength(80);
                    // force.distanceMax(200);
                    this.force.force(`group-${Math.random()}`, force);
                }
            });


        }

        this.force.on("tick", () => {
            this.netGraph.controller.eventController.fire("_updateEntityPosition", [nodeIds, true])
        })
        let force = this.force;
        setTimeout(() => {
            if (force) {
                force.stop()
            }
        }, 30000)
    }

    autoCombined(nodes, srclinks = null) {
        // 1. Prepare Links
        let links = [];
        if (srclinks) {
            links = srclinks;
        } else if (this.netGraph) {
            links = this.netGraph.getLinks();
        }

        // Create a Set of valid node IDs for fast lookup
        const validNodeIds = new Set(nodes.map(n => String(n.id)));

        // Map links to a format d3 can use (source/target as IDs)
        // D3 will mutate these objects to replace IDs with node references
        const simulationLinks = links.map(link => {
            // Try to find source/target IDs in common locations
            // Direct properties or nested in data
            let source = link.source || link.from;
            let target = link.target || link.to;
            
            if (link.data) {
                source = source || link.data.source || link.data.from;
                target = target || link.data.target || link.data.to;
            }

            // If source/target are objects (already processed), use their ID
            if (source && typeof source === 'object') source = source.id;
            if (target && typeof target === 'object') target = target.id;

            return {
                source: String(source),
                target: String(target),
                value: (link.data && link.data.value) || link.value || 1
            };
        }).filter(l => validNodeIds.has(l.source) && validNodeIds.has(l.target));

        // 2. Setup Simulation
        if (this.force) {
            this.force.stop();
        }

        // Standard Force-Directed Layout
        // Nodes repel each other (Charge/ManyBody)
        // Connected nodes attract each other (Link)
        this.force = d3.forceSimulation(nodes)
            .force("charge", d3.forceManyBody()
                .strength(-30) // Strong repulsion
                // .distanceMax(1000)
            )
            .force("link", d3.forceLink(simulationLinks)
                .id(d => String(d.id)) // Match node IDs
                .distance(100) // Desired link length
                .strength(0.05)   // Attraction strength
            )



        // 3. Tick Handler
        const groupNodes = nodes.filter(n => {
            const data = n.data || n;
            return data.type === 'group_aggregate' || (data.original && data.original.type === 'group_aggregate');
        });
        groupNodes.sort((a, b) => String(a.id).localeCompare(String(b.id)));
        const groupK = groupNodes.length;

        this.force.force("group-radial", (alpha) => {
            if (groupK === 0) return;
            const strength = 150; // Force magnitude
            groupNodes.forEach((node, i) => {
                const angle = (i / groupK) * 2 * Math.PI;
                // Force vector direction
                const fx = Math.cos(angle);
                const fy = Math.sin(angle);

                node.vx += fx * strength * alpha;
                node.vy += fy * strength * alpha;
            });
        });

        const nodeIds = nodes.map(n => n.id);
        this.force.on("tick", () => {
            if (this.netGraph && this.netGraph.controller && this.netGraph.controller.eventController) {
                this.netGraph.controller.eventController.fire("_updateEntityPosition", [nodeIds, true]);
            }
        });

        // 4. Auto-stop after 30 seconds
        let force = this.force;
        setTimeout(() => {
            if (force) {
                force.stop();
            }
        }, 30000);
    }

    jutuan(nodes) {
        const mythis = this;
        let nodeIds = nodes.map(node => node.id);
        this.netGraph.updateSettings({
            layout: {
                mode: 'dynamic'
            },
            gravity: {
                from: 'node',
                to: 'cluster',
                strength: 100
            },
            layoutFreezeMinTimeout: 100,
            layoutFreezeTimeout: 2000,
            incrementalLayoutMaxTime: 2000,
            initialLayoutMaxTime: 2000,
            globalLayoutOnChange: false
        });
        setTimeout(function () {
            mythis.netGraph.updateGraph(nodeIds)
            setTimeout(function () {
                mythis.netGraph.updateSettings({
                    layout: {
                        mode: "static"
                    }
                });
            }, 5000);
        }, 200);
    }

    hierarchy(rootNodes) {
        if (rootNodes.length > 0) {
            let allIds = [];
            const data = BFSTree(rootNodes, this.netGraph.getNodes(), this.netGraph.getLinks());
            const fakeNode = { id: "fake_node_id", children: [] }

            for (let i = 0; i < data.nodes.length; i++) {
                fakeNode.children.push(data.nodes[i]);
            }
            let nn1 = [];
            const initx = rootNodes[0].x;
            const inity = rootNodes[0].y;
            let allNodeIds = [];
            const root = d3.hierarchy(fakeNode);
            root.dx = 100;
            root.dy = 150;
            d3.tree().nodeSize([root.dx, root.dy])(root);

            let ct = root;

            let tt = {
                id: ct.data.id,
                x: root.x,
                y: root.y
            };
            if (root.children && root.children.length > 0) {
                let stack = root.children;
                while (stack.length !== 0) {
                    let ctt = stack.pop();
                    let ttt = {
                        id: ctt.data.id,
                        x: ctt.x,
                        y: ctt.y
                    }
                    nn1.push(ttt);
                    if (ctt.children && ctt.children.length > 0) {
                        ctt.children.forEach(child => {
                            stack.push(child)
                        })
                    }
                }
            }
            nn1.forEach(v => {
                if (v.id === "fake_node_id") {

                } else {
                    allNodeIds.push(v.id);
                }
            });
            const allNodes = this.netGraph.getNodes(allNodeIds);
            allNodes.forEach((node, i) => {
                node.x = nn1[i].x + initx;
                node.y = nn1[i].y + inity - 150;
            })
            allIds = [...allIds, ...allNodeIds];
            this.netGraph.controller.eventController.fire("_updateEntityPosition", [allIds, true])
        }
    }
    hierarchy_v1(rootNodes) {
        if (rootNodes.length > 0) {
            const data = BFSTree(rootNodes, this.netGraph.getNodes(), this.netGraph.getLinks())
            let allIds = [];
            for (let i = 0; i < data.nodes.length; i++) {
                let nn1 = [];
                const initx = rootNodes[i].x;
                const inity = rootNodes[i].y;
                let allNodeIds = [];
                const root = d3.hierarchy(data.nodes[i]);
                root.dx = 100;
                root.dy = 300;
                d3.tree().nodeSize([root.dx, root.dy])(root);
                //console.log(root);
                let ct = root;

                let tt = {
                    id: ct.data.id,
                    x: root.x,
                    y: root.y
                };
                nn1.push(tt);
                if (root.children && root.children.length > 0) {
                    let stack = root.children;
                    while (stack.length !== 0) {
                        let ctt = stack.pop();
                        let ttt = {
                            id: ctt.data.id,
                            x: ctt.x,
                            y: ctt.y
                        }
                        nn1.push(ttt);
                        if (ctt.children && ctt.children.length > 0) {
                            ctt.children.forEach(child => {
                                stack.push(child)
                            })
                        }
                    }
                }
                allNodeIds = nn1.map(item => item.id);
                const allNodes = this.netGraph.getNodes(allNodeIds);
                allNodes.forEach((node, i) => {
                    node.x = nn1[i].x + initx;
                    node.y = nn1[i].y + inity;
                })
                allIds = [...allIds, ...allNodeIds];
            }

            this.netGraph.controller.eventController.fire("_updateEntityPosition", [allIds, true])
        }
    }

    timeSequential(nodes) { // 时序布局
        const mthis = this;
        const docnodeids = [];
        const eventnodeids = [];
        const entitynodeids = [];
        const nodeIds = [];
        nodes.forEach(node => {
            const data = node.data ? node.data : node;
            const id = data.id;
            nodeIds.push(id);
            if (data.metaType === 'event') {
                eventnodeids.push(id);
            } else if (data.metaType === 'document') {
                docnodeids.push(id);
            } else if (data.metaType === 'entity') {
                entitynodeids.push(id);
            }
        });
        const datetype = 'day'; // 时序分度值
        const mixed = true; // 时序是否混合显示
        const params = {
            event_ids: eventnodeids,
            doc_ids: docnodeids,
            group_by: datetype,
            mix: mixed
        };
        mthis.netWorkBackEnd.timeLineLayout(params, result => {
            const baseX = 400 * (Math.random() - 0.5) + 200;
            let baseY = baseX;
            let pos = [0, 0];
            // 排布其他节点
            if (entitynodeids.length > 0) {
                pos = dynamicPos.getSquarePosition(baseX, baseY, entitynodeids);

                entitynodeids.forEach((item, index) => {
                    mthis.netGraph.getNode(item).x = pos[index][0];
                    mthis.netGraph.getNode(item).y = pos[index][1];
                });
            }
            baseY = baseY - 200;
            if (mixed) {
                // 混合排布
                Object.keys(result).forEach((item, index) => {
                    const Xr = baseX + index * 150;
                    result[item].mix_ids.forEach((it, ind) => {
                        mthis.netGraph.getNode(it).x = Xr;
                        mthis.netGraph.getNode(it).y = baseY - ind * 100;
                    });
                });
            } else {
                // 非混合排布
            }
            this.netGraph.controller.eventController.fire("_updateEntityPosition", [nodeIds, true])
        });
    }

    dagre(nodes) {
        if (!nodes || nodes.length === 0) return;

        const g = new dagre.graphlib.Graph();
        g.setGraph({
            rankdir: 'TB',
            nodesep: 50,
            ranksep: 50
        });
        g.setDefaultEdgeLabel(() => ({}));

        const nodeIds = new Set(nodes.map(n => n.id));
        
        nodes.forEach(node => {
            g.setNode(node.id, { width: 100, height: 50 });
        });

        const links = this.netGraph.getLinks();
        links.forEach(link => {
            if (nodeIds.has(link.data.from) && nodeIds.has(link.data.to)) {
                g.setEdge(link.data.from, link.data.to);
            }
        });

        dagre.layout(g);

        const updatedNodeIds = [];
        let baseX = nodes[0].x || 0;
        let baseY = nodes[0].y || 0;
        
        let minX = Infinity;
        let minY = Infinity;
        
        g.nodes().forEach(v => {
             const pos = g.node(v);
             if (pos.x < minX) minX = pos.x;
             if (pos.y < minY) minY = pos.y;
        });

        g.nodes().forEach(v => {
            const node = nodes.find(n => n.id === v);
            if (node) {
                const pos = g.node(v);
                node.x = baseX + (pos.x - minX);
                node.y = baseY + (pos.y - minY);
                updatedNodeIds.push(node.id);
            }
        });

        this.netGraph.controller.eventController.fire("_updateEntityPosition", [updatedNodeIds, true]);
    }
}