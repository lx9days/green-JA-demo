import { Deck, COORDINATE_SYSTEM, OrthographicView, Viewport, FlyToInterpolator, LinearInterpolator, MapView } from '@deck.gl/core';
import { ScatterplotLayer, IconLayer, LineLayer, TextLayer, PolygonLayer, SolidPolygonLayer, PathLayer } from '@deck.gl/layers';
import hexRgb from 'hex-rgb';
import RoundedRectangleLayer from '../compositelayer/RoundedRectangleLayer';
import BrushCanvas from '../helper/brushCanvas';
// const COlOR={
//     color1:[125,56,45],
//     colorRed:[255,0,0]
//     colorBlue
// }
const ICONDIM = 60;
const MINIMAP_SIZE = 300; // 鹰眼图大小 (px)
const MINIMAP_MARGIN = 20; // 鹰眼图边距

export default class CanvasController {
    constructor(props, eventController) {
        this.props = props;
        console.log(props)

        this.boxSelecting = false;
        this.isAllowCanvasMove = false;
        this.elementController = null;
        this.renderObject = null;
        this.groupDrag = false;
        this.dragDoune = null;
        this.isJustDraged=false;

        this.updateFlag = {
            position: 0,
            style: 0,
            bubble: 0,
            icon: 0,
            iconTimer: null,
        }
        this.animationData = [];

        this.invalidIncons = new Map();

        this.eventController = eventController;

        this.nodeClickHandler = this._nodeClickHandler.bind(this);
        this.nodeDragStartHandler = this._nodeDragStartHandler.bind(this);
        this.nodeDragingHandler = this._nodeDragingHandler.bind(this);
        this.nodeDragEndHandler = this._nodeDragEndHandler.bind(this);
        this.lineClickHandler = this._lineClickHandler.bind(this);
        this.deckClickHandler = this._deckClickHandler.bind(this);
        this.deckDragStartHandler = this._deckDragStartHandler.bind(this);
        this.deckDragingHandler = this._deckDragingHandler.bind(this);
        this.deckDragEndHandler = this._deckDragEndHandler.bind(this);
        this.onViewStateChange = this._onViewStateChange.bind(this);
        this._brushInfoCallBack = this._brushInfoCallBack.bind(this);
        this.onIconErrorHander = this._iconErrorHander.bind(this);
        this.lastHoverElement = null;

        // Minimap state
        this.minimapViewState = {
            target: [0, 0, 0],
            zoom: -3, // Default small zoom
            rotationX: 0,
            rotationOrbit: 0
        };
        this.dataBounds = null; // Store data bounding box

        this._initializeCanvas();
    }

    _initializeCanvas() {
        const initViewState = {
            target: [this.props.containerWidth / 2, this.props.containerHeight / 2, 0],
            rotationX: 0,
            rotationOrbit: 0,
            zoom: this.props.zoom,
        }
        this.props.viewState = initViewState;
        this.props.initTarget = initViewState.target;
        const container = document.getElementById(this.props.container);
        if (!this.props.containerWidth || !this.props.containerHeight) {

            throw Error('please setup container dimension');

        }
        this.canvas = document.createElement('canvas');
        this.canvas.width = this.props.containerWidth;
        this.canvas.height = this.props.containerHeight;
        this.canvas.addEventListener('contextmenu', (e) => {
            this.eventController.fire("canvasRightClick", [e]);
            e.preventDefault();
        })
        this.canvas.addEventListener('mousedown', e => {
            this.eventController.fire("canvasMouseDown", [e])
            e.preventDefault();
        })
        this.canvas.addEventListener('mouseup', e => {
            this.eventController.fire("canvasMouseUp", [e])
            e.preventDefault();
        })
        this.canvas.addEventListener('mousemove', e => {
            this.eventController.fire('canvasMouseMove', [e]);
            e.preventDefault();
        });
        this.canvas.addEventListener('dblclick',e=>{
            this.eventController.fire('canvasDoubleClick',[e]);
            e.preventDefault();
        });
      
        container.appendChild(this.canvas);
        this.gl = this.canvas.getContext('webgl2');
        if (this.deck) {
            this.deck = null;
        }

        // Initialize minimap view state centered
        this.minimapViewState = {
            target: [this.props.containerWidth / 2, this.props.containerHeight / 2, 0],
            zoom: -3,
            rotationX: 0,
            rotationOrbit: 0
        };

        const views = [
            new OrthographicView({
                id: 'globalView',
                x: 0,
                y: 0,
                width: '100%',
                height: '100%',
                maxZoom: this.props.maxZoom,
                minZoom: this.props.minZoom,
                controller: true,
                doubleClickZoom: false,
            })
        ];

        if (this.props.minimap) {
            views.push(new OrthographicView({
                id: 'minimapView',
                x: this.props.containerWidth - MINIMAP_SIZE - MINIMAP_MARGIN,
                y: this.props.containerHeight - MINIMAP_SIZE - MINIMAP_MARGIN,
                width: MINIMAP_SIZE,
                height: MINIMAP_SIZE,
                clear: true,
                controller: {
                    scrollZoom: true,
                    dragPan: true,
                    dragRotate: false,
                    doubleClickZoom: false,
                    touchZoom: true,
                    touchRotate: false,
                    keyboard: false
                }
            }));
        }

        const viewState = {
            globalView: this.props.viewState
        };
        if (this.props.minimap) {
            viewState.minimapView = this.minimapViewState;
        }

        this.deck = new Deck({
            views: views,
            width: this.props.containerWidth,
            height: this.props.containerHeight,
            viewState: this.props.minimap ? viewState : this.props.viewState,
            layerFilter: ({ layer, viewport }) => {
                if (this.props.minimap) {
                    // Minimap-only layers
                    if (layer.id.startsWith('minimap-') || layer.id === 'viewport-frame-layer') {
                        return viewport.id === 'minimapView';
                    }
                    
                    // Layers that should NOT appear in Minimap (because we have replacements)
                    const globalOnlyLayers = [
                        'icon-layer', 
                        'text-layer', 
                        'group-text-layer', 
                        'label-layer',
                        'node-label-layer'
                    ];
                    
                    if (viewport.id === 'minimapView') {
                        return !globalOnlyLayers.includes(layer.id);
                    }
                    
                    return viewport.id === 'globalView';
                }
                return true;
            },
            onViewStateChange: this.onViewStateChange,
            gl: this.gl,
            controller: true,
            onClick: this.deckClickHandler,
            onDragStart: this.deckDragStartHandler,
            onDragEnd: this.deckDragEndHandler,
            pickingRadius: 6,
            getTooltip: ({ object }) => {
                if (object && object.origionElement) {
                    if (object.origionElement.data.metaType === 'nodeSet' && object.origionElement.data.statistics && Object.keys(object.origionElement.data.statistics).length > 0) {
                        let html = '';
                        for (const key in object.origionElement.data.statistics) {
                            html += `<div>${key}:${object.origionElement.data.statistics[key]}</div>`
                        }
                        return {
                            html: `<div>${html}</div>`,
                            style: {
                                backgroundColor: '#d9d9d9',

                            }
                        }
                    } else if (object.origionElement.data) {
                        let html = '';
                        const data = object.origionElement.data;
                        
                        // Try to parse if it's a string, just in case
                        // (Assuming it's already an object based on usage)
                        
                        Object.entries(data).forEach(([key, value]) => {
                            if (typeof value === 'object' && value !== null) {
                                html += `<div><strong>${key}:</strong> ${JSON.stringify(value)}</div>`;
                            } else {
                                html += `<div><strong>${key}:</strong> ${value}</div>`;
                            }
                        });

                        if (!html) {
                             // Fallback if data is empty but id exists on element
                             if (object.origionElement.id) {
                                 html = `<div><strong>id:</strong> ${object.origionElement.id}</div>`;
                             }
                        }

                        if (html) {
                            return {
                                html: `<div style="max-width: 300px; word-wrap: break-word;">${html}</div>`,
                                style: {
                                    backgroundColor: '#333',
                                    color: '#fff',
                                    padding: '8px',
                                    borderRadius: '4px',
                                    fontSize: '12px',
                                    zIndex: 1000
                                }
                            }
                        }
                    }
                }
            }
            //getCursor:({isDragging,isHovering}) => isHovering ? 'grabbing' : 'grab'
        });
       
        this.props.viewState.height = this.props.containerHeight;
        this.props.viewState.width = this.props.containerWidth;
        this.props.viewState.maxRotationX = 90;
        this.props.viewState.minRotationX = -90;
        this.props.viewState.orbitAxis = "Z";
        this.props.viewState.rotationOrbit = 0;
        this.props.viewState.rotationX = 0;
        this.props.viewState.minZoom = -Infinity;
        this.props.viewState.maxZoom = Infinity;
    }

    _onViewStateChange({ viewId, viewState, oldViewState, interactionState }) {
        if (viewId === 'minimapView') {
            // Synchronize minimap interactions to global view
            // We do NOT update minimapViewState, so it stays fixed
            
            // Calculate scale factor between minimap and global view
            // Since minimap is just a zoomed out version, the delta in world coordinates is the same.
            // However, interaction feels better if we inverse the direction? No, dragPan moves the camera.
            // If I drag camera right, viewport moves right, content moves left.
            // If I want to move the "frame" to the right (to see right content), I need to move camera right.
            
            if (interactionState.isZooming) {
                // Apply zoom delta to global view
                const zoomDelta = viewState.zoom - oldViewState.zoom;
                this.props.zoom += zoomDelta;
                // Update global view zoom
                this.props.viewState = {
                    ...this.props.viewState,
                    zoom: this.props.zoom
                };
                this.updateRenderGraph();
            } else if (interactionState.isPanning) {
                // Apply pan delta to global view
                // Reverse direction for minimap interaction to simulate dragging the frame
                
                // Ensure we have a start target (in case dragStart was missed or sequence is odd)
                if (!this.minimapPanStartGlobalTarget) {
                     this.minimapPanStartGlobalTarget = [...this.props.viewState.target];
                }

                // Calculate TOTAL delta from the fixed minimap state
                // viewState.target is the accumulated position from the start of the drag (since oldViewState is fixed)
                const dx = viewState.target[0] - oldViewState.target[0];
                const dy = viewState.target[1] - oldViewState.target[1];
                
                this.props.viewState = {
                    ...this.props.viewState,
                    target: [
                        this.minimapPanStartGlobalTarget[0] - dx,
                        this.minimapPanStartGlobalTarget[1] - dy,
                        0
                    ]
                };
                this.updateRenderGraph();
            }
            
            // Force update to refresh viewport frame
            this.deck.setProps({
                viewState: {
                    globalView: this.props.viewState,
                    minimapView: this.minimapViewState
                }
            });
            return;
        }

        if (this.isAllowCanvasMove && !this.boxSelecting) {
            this.updateRenderGraph(viewState);
        } else {
            if (interactionState.isZooming) {
                this.props.zoom = viewState.zoom;
                this.updateRenderGraph(viewState);
            } else {
                viewState.target = oldViewState.target;
            }
        }
        this.props.viewState = viewState;
        
        // Ensure minimap state is passed
        if (this.props.minimap) {
            this.deck.setProps({ 
                viewState: {
                    globalView: this.props.viewState,
                    minimapView: this.minimapViewState
                }
            });
        } else {
            this.deck.setProps({ 
                viewState: {
                    globalView: this.props.viewState
                }
            });
        }
    }

    _deckClickHandler(info, e) {
        if (e.leftButton) {
            this.eventController.fire('emptyClick', [info, e]);
        }
        return true;
    }

    _deckDragStartHandler(info, e) {
        this.isJustDraged=true
        setTimeout(()=>{
            this.isJustDraged=false
        },4000)
        this.isAllowCanvasMove = true;

        if (info && info.viewport && info.viewport.id === 'minimapView') {
            this.minimapPanStartGlobalTarget = [...this.props.viewState.target];
        }
    }

    _deckDragingHandler(info, e) {

    }

    _deckDragEndHandler(info, e) {
        this.isAllowCanvasMove = false;
        this.minimapPanStartGlobalTarget = null;
    }


    updateRenderGraph(viewStat = null) {
        const zoom = this.props.zoom;
        const styleFlag = this.updateFlag.style;
        const positionFlag = this.updateFlag.position;
        const bubbleFlag = this.updateFlag.bubble;
        const iconFlag = this.updateFlag.icon;
        const invalidIcon = this.invalidIncons
        const defaultUrlMap = this.props.defaultUrlMap;
        const defaultUrlFunc = this.props.defaultUrlFunc;
        const { renderBackgrounds, renderIcons, renderLines, renderText, renderPolygon, charSet, renderMark, renderLabels, renderBubble, renderDashLine, renderGroupTexts, groupTextSet } = this.renderObject;
        const lineHighlightRGB = hexRgb(this.props.lineHighlightColor);
        const lineHighlightOpactiy = this.props.lineHighlightOpacity;
        let bubbleLayer = null
        if (renderBubble.length > 0) {
            bubbleLayer = new SolidPolygonLayer({
                id: 'bubble-layer',
                data: renderBubble,
                positionFormat: 'XY',
                opacity:0.05,
                getPolygon: d => d.polygon,
                getFillColor: d => d.color,
                updateTriggers: {
                    getPolygon: positionFlag + bubbleFlag,

                },
            });

        }
        let animationLayer = null;
        if (this.animationData.length > 0) {
            let animationTrigger = Math.random();
            animationLayer = new ScatterplotLayer({
                id: 'animation-layer',
                data: this.animationData,
                stroked: false,
                filled: true,
                getPosition: d => d.currentPos,
                getRadius: d => d.radius,
                getFillColor: d => d.color,
                updateTriggers: {
                    getPosition: animationTrigger,
                }
            })
        }
        const lineLayer = new LineLayer({
            id: 'line-layer',
            data: renderLines,
            autoHighlight: true,
            highlightColor: [lineHighlightRGB.red, lineHighlightRGB.green, lineHighlightRGB.blue, lineHighlightOpactiy * 255],
            pickable: true,
            positionFormat: 'XY',
            getWidth: d => d.style.lineWidth,
            getSourcePosition: d => d.sourcePosition,
            getTargetPosition: d => d.targetPosition,
            getColor: d => d.style.lineColor,
            updateTriggers: {
                getSourcePosition: positionFlag,
                getTargetPosition: positionFlag,
                getColor: styleFlag,
            },
            onClick: this.lineClickHandler,
        });
        const dashLineLayer = new LineLayer({
            id: 'dash-line-layer',
            data: renderDashLine.filter(() => true),
            autoHighlight: true,
            highlightColor: [lineHighlightRGB.red, lineHighlightRGB.green, lineHighlightRGB.blue, lineHighlightOpactiy * 255],
            pickable: true,
            getWidth: d => d.style.lineWidth,
            getSourcePosition: d => d.sourcePosition,
            getTargetPosition: d => d.targetPosition,
            getColor: d => d.style.lineColor,
            updateTriggers: {
                getSourcePosition: positionFlag,
                getTargetPosition: positionFlag,
                getColor: styleFlag,
            },
            onClick: this.lineClickHandler,
        });
        const iconLayer = new IconLayer({
            id: 'icon-layer',
            data: renderIcons,
            pickable: true,
            coordinateSystem: COORDINATE_SYSTEM.CARTESIAN,
            sizeScale: 2 ** zoom,
            getPosition: d => d.position,
            positionFormat: 'XY',
            getIcon: d => {
                let url = null;
                if (invalidIcon.has(d.url)) {
                    let type = defaultUrlFunc(d);
                    url = defaultUrlMap[type];
                } else {
                    url = d.url;
                }
                return {
                    url: url,
                    width: ICONDIM,//d.style.iconHeight,
                    height: ICONDIM,//d.style.iconHeight,
                    anchorX: 0,
                    anchorY: 0,
                }
            },
            onIconError: this.onIconErrorHander,
            getSize: d => d.style.iconSize ,// * (2 ** zoom),//this 指向问题
            updateTriggers: {
                getPosition: positionFlag,
                getIcon: iconFlag,
            }
        });

        const circleEdge = new ScatterplotLayer({
            id: 'circleedge-layer',
            data: renderBackgrounds.filter((v) => v.shapeType === 0),
            coordinateSystem: COORDINATE_SYSTEM.CARTESIAN,
            opacity: 1,
            stroked: true,
            filled: true,
            autoHighlight: false,
            getFillColor: (d) => {
                return d.style.backgroundColor || [255, 255, 255, 255];
            },
            getRadius: (d) => {
                return d.style.circleHeight / 2;
            },
            getPosition: (d) => {
                return d.position;
            },
            getLineColor: (d) => {
                if (d.status === 2) {
                    return d.style.borderColor
                } else {
                    return [255, 255, 255, 0];
                }
            },
            getLineWidth: (d) => {
                return d.style.borderWidth || 4;
            },
            getWidth: (d) => {
                return d.style.width;
            },
            onDrag: this.nodeDragingHandler,
            onClick: this.nodeClickHandler,
            onDragStart: this.nodeDragStartHandler,
            onDragEnd: this.nodeDragEndHandler,

        });
        // const roundedEdge = new RoundedRectangleLayer({
        //     id: 'rounded',
        //     data: renderBackgrounds.filter((v) => v.shapeType === 1),
        //     opacity: 1,
        //     getFillColor: (d) => {
        //         return d.style.backgroundColor || [255, 255, 255, 255];
        //     },
        //     getLineColor: (d) => {
        //         if (d.status === 2) {
        //             return d.style.borderColor
        //         } else {
        //             return [255, 255, 255, 0];
        //         }
        //     },
        //     getLineWidth: (d) => {
        //         if (d.status === 2) {
        //             return d.style.borderWidth || 4
        //         } else {
        //             return 0;
        //         }
        //     },
        //     getFirstScatterPosition: (d) => {
        //         return d.position;
        //     },
        //     getSecondScatterPosition: (d) => {
        //         return [d.position[0] + d.style.backgroundWidth, d.position[1]];
        //     },
        //     getPolygon: (d) => {
        //         return [[d.position[0], d.position[1] + d.style.backgroundHeight / 2], [d.position[0] + d.style.backgroundWidth, d.position[1] + d.style.backgroundHeight / 2], [d.position[0] + d.style.backgroundWidth, d.position[1] - d.style.backgroundHeight / 2], [d.position[0], d.position[1] - d.style.backgroundHeight / 2]];
        //     },
        //     getFirstPath: (d) => {
        //         return [[d.position[0] - d.style.borderWidth / 2, d.position[1] - d.style.backgroundHeight / 2], [d.position[0] + d.style.backgroundWidth + d.style.borderWidth / 2, d.position[1] - d.style.backgroundHeight / 2]];
        //     },
        //     getSecondPath: (d) => {
        //         return [[d.position[0] - d.style.borderWidth / 2, d.position[1] + d.style.backgroundHeight / 2], [d.position[0] + d.style.backgroundWidth + d.style.borderWidth / 2, d.position[1] + d.style.backgroundHeight / 2]];
        //     },
        //     getCircleRadius: (d) => {
        //         return d.style.backgroundHeight / 2;
        //     }
        // })
        const rectBackgroundLayer = new PolygonLayer({
            id: 'rect-background-layer',
            data: renderBackgrounds,
            opacity: 1,
            getFillColor: (d) => {
                if (d.status === 2) {
                    return d.style.backgroundColor;
                } else {
                    return [255, 255, 255, 0];
                }
            },
            getPolygon: (d) => {
                return d.backgroundPolygon;
            },
            getLineColor: (d) => {
                if (d.status === 2) {
                    return d.style.borderColor;
                } else {
                    return [255, 255, 255.0];
                }
            },
            getLineWidth: (d) => {
                if (d.status === 2) {
                    return d.style.borderWidth;
                } else {
                    return 0;
                }
            },
            filled: true,
            stroked: true,
            positionFormat: 'XY',
            updateTriggers: {
                //getPolygon: positionFlag,
                getFillColor: styleFlag,
                getPolygon: styleFlag + positionFlag,
            }
        });
        const textLayer = new TextLayer({
            id: 'text-layer',
            coordinateSystem: COORDINATE_SYSTEM.CARTESIAN,
            data: renderText,
            fontFamily: 'Microsoft YaHei',
            sizeScale: 2 ** zoom,
            getPosition: d => {
                return [d.position[0]+5, d.position[1]+15];
            },
            getText: d => d.text,
            getSize: d => d.style.textSize,
            getAngle: 0,
            getTextAnchor: d => d.style.textAnchor,
            getAlignmentBaseline: d => d.style.textAlignmentBaseline,
            characterSet: charSet,
            getColor: (d) => d.style.textColor,
            updateTriggers: {
                getPosition: positionFlag,
                getSize: styleFlag,
                getColor: styleFlag
            }
        });
        const groupTextLayer = new TextLayer({
            id: 'group-text-layer',
            coordinateSystem: COORDINATE_SYSTEM.CARTESIAN,
            data: renderGroupTexts,
            maxWidth: 360,
            wordBreak: 'break-all',
            fontFamily: 'Microsoft YaHei',
            sizeScale: 2 ** zoom,
            getPosition: d => {
                return d.position;
            },
            getText: d => {
                return d.text;
            },
            getSize: d => d.style.textSize,
            getAngle: 0,
            getTextAnchor: d => d.style.textAnchor,
            getAlignmentBaseline: d => d.style.textAlignmentBaseline,
            characterSet: groupTextSet,
            getColor: (d) => d.style.textColor,
            updateTriggers: {
                getPosition: positionFlag,
                getSize: styleFlag,
                getColor: styleFlag
            }
        });

        const arrowLayer = new PolygonLayer({
            id: 'arrow-layer',
            opacity: 1,
            data: renderPolygon,
            filled: true,
            stroked: true,
            getLineWidth: 1,
            getLineColor: d => d.style.polygonFillColor,
            getPolygon: d => {
                return d.polygon;
            },
            positionFormat: 'XY',
            getFillColor: (d) => d.style.polygonFillColor,
            updateTriggers: {
                getPolygon: positionFlag,
                getFillColor: styleFlag,
                getLineColor: styleFlag,
            }
        });
        const markRGB = hexRgb(this.props.nodeHighlightColor);
        const markOpactiy = this.props.nodeHighlightOpacity;
        const markLayer = new PolygonLayer({
            id: "mark-layer",
            opacity: 1,
            data: renderMark,
            pickable: true,
            filled: true,
            stroked: false,
            autoHighlight: true,
            highlightColor: [markRGB.red, markRGB.green, markRGB.blue, markOpactiy * 255],
            positionFormat: 'XY',
            getPolygon: d => {
                return d.backgroundPolygon
                return [
                    [d.backgroundPolygon[0][0],d.backgroundPolygon[0][1]],
                    [d.backgroundPolygon[1][0]+d.style.borderWidth*2,d.backgroundPolygon[1][1]],
                    [d.backgroundPolygon[2][0]+d.style.borderWidth * 2,d.backgroundPolygon[2][1]+d.style.borderWidth * 2],
                    [d.backgroundPolygon[3][0],d.backgroundPolygon[3][1]+d.style.borderWidth * 2]
            ]
            // return resolveBorder
            },
            getFillColor: (d) => {
                if (d.status === 4) {
                    return d.style.highLightColor;
                } else {
                    return [255, 255, 255, 0];
                }
            },
            updateTriggers: {
                getFillColor: styleFlag,
                getPolygon: positionFlag + styleFlag,
            },
            onDrag: this.nodeDragingHandler,
            onClick: this.nodeClickHandler,
            onDragStart: this.nodeDragStartHandler,
            onDragEnd: this.nodeDragEndHandler,
        });
        const labelLayer = new IconLayer({
            id: 'label-layer',
            data: renderLabels,
            coordinateSystem: COORDINATE_SYSTEM.CARTESIAN,
            getPosition: d => d.position,
            sizeScale: 2 ** zoom,
            getIcon: d => ({
                url: d.url,
                width: d.style.iconHeight,
                height: d.style.iconHeight,
                anchorX: 0,
                anchorY: 0,
            }),
            getSize: d => d.style.iconSize,//this 指向问题
            updateTriggers: {
                getPosition: positionFlag,
            }
        });
        const nodelabelLayer = new TextLayer({
            id: 'node-label-layer',
            coordinateSystem: COORDINATE_SYSTEM.CARTESIAN,
            data: renderGroupTexts,
            background: true,
            backgroundPadding: [5, 2, 5, 2],
            sizeScale: 2 ** zoom,
            fontFamily: 'Microsoft YaHei',
            getPosition: d => {
                return [d.position[0] + d.style.backgroundWidth/4, d.position[1] - d.style.backgroundHeight];
            },
            getText: d => "节点数:10",
            getSize: d => 15,
            getAngle: 0,
            getTextAnchor: d => d.style.textAnchor,
            getAlignmentBaseline: d => d.style.textAlignmentBaseline,
            characterSet: ['节','点','数',':','1','0'],
            getColor: (d) => [50, 65, 137, 255],
            getBackgroundColor: (d) => {
                return [255,140,0,255];
            },
            updateTriggers: {
                getPosition: positionFlag,
                getColor: styleFlag
            }
        });

        // --- Minimap Layers & Logic ---
        let minimapBackgroundLayer = null;
        let viewportFrameLayer = null;

        if (this.props.minimap && renderBackgrounds && renderBackgrounds.length > 0) {
             // Calculate bounds
             let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
             
             // Consider both backgrounds and icons for bounds
             const elementsToCheck = [...renderBackgrounds];
             if (renderIcons) elementsToCheck.push(...renderIcons);

             for (const d of elementsToCheck) {
                 if (!d.position) continue;
                 const [x, y] = d.position;
                 
                 // Estimate size (radius or half-width/height)
                 // circleHeight for nodes, iconSize for icons, backgroundWidth for rects
                 let size = 30; // Default half-size
                 if (d.style) {
                     const s = d.style.circleHeight || d.style.backgroundWidth || d.style.iconSize || 60;
                     size = s / 2;
                 }

                 if (x - size < minX) minX = x - size;
                 if (x + size > maxX) maxX = x + size;
                 if (y - size < minY) minY = y - size;
                 if (y + size > maxY) maxY = y + size;
             }
             
             // Add padding
             const padding = 100;
             minX -= padding;
             maxX += padding;
             minY -= padding;
             maxY += padding;
             
             const width = maxX - minX;
             const height = maxY - minY;
             
             if (width > 0 && height > 0) {
                 const scaleX = MINIMAP_SIZE / width;
                 const scaleY = MINIMAP_SIZE / height;
                 const minimapZoom = Math.log2(Math.min(scaleX, scaleY));
                 
                 this.minimapViewState = {
                     target: [(minX + maxX) / 2, (minY + maxY) / 2, 0],
                     zoom: minimapZoom,
                     rotationX: 0,
                     rotationOrbit: 0
                 };
             }

             // Minimap Background
             minimapBackgroundLayer = new SolidPolygonLayer({
                 id: 'minimap-background-layer',
                 data: [{ polygon: [[minX, minY], [maxX, minY], [maxX, maxY], [minX, maxY]] }],
                 getPolygon: d => d.polygon,
                 getFillColor: [240, 240, 240, 255],
                 stroked: true,
                 getLineColor: [200, 200, 200, 255],
                 getLineWidth: 10,
             });

             // Viewport Frame
             const { containerWidth, containerHeight, viewState } = this.props;
             const currentViewState = viewStat || viewState;
             const currentZoom = currentViewState.zoom;
             const [tX, tY] = currentViewState.target;
             
             const vpW = containerWidth / Math.pow(2, currentZoom);
             const vpH = containerHeight / Math.pow(2, currentZoom);
             
             const framePath = [
                 [tX - vpW / 2, tY - vpH / 2],
                 [tX + vpW / 2, tY - vpH / 2],
                 [tX + vpW / 2, tY + vpH / 2],
                 [tX - vpW / 2, tY + vpH / 2],
                 [tX - vpW / 2, tY - vpH / 2]
             ];

             viewportFrameLayer = new PathLayer({
                 id: 'viewport-frame-layer',
                 data: [{ path: framePath }],
                 coordinateSystem: COORDINATE_SYSTEM.CARTESIAN,
                 getPath: d => d.path,
                 getColor: [255, 0, 0, 200],
                 getWidth: 3,
                 widthUnits: 'pixels',
                 updateTriggers: {
                     getPath: [tX, tY, currentZoom]
                 }
             });
        }
        
        let minimapLayers = [];
        if (this.props.minimap) {
            // Clone IconLayer for Minimap (use 'common' units to scale with zoom)
            minimapLayers.push(new IconLayer({
                ...iconLayer.props,
                id: 'minimap-icon-layer',
                sizeUnits: 'common',
                sizeScale: 1, // Reset scaling
                getSize: d => d.style.iconSize || 60,
                updateTriggers: iconLayer.props.updateTriggers
            }));

            // Clone TextLayer for Minimap
            minimapLayers.push(new TextLayer({
                ...textLayer.props,
                id: 'minimap-text-layer',
                sizeUnits: 'common',
                sizeScale: 1,
                getSize: d => d.style.textSize || 16,
                updateTriggers: textLayer.props.updateTriggers
            }));

            // Clone GroupTextLayer for Minimap
            minimapLayers.push(new TextLayer({
                ...groupTextLayer.props,
                id: 'minimap-group-text-layer',
                sizeUnits: 'common',
                sizeScale: 1,
                getSize: d => d.style.textSize || 16,
                updateTriggers: groupTextLayer.props.updateTriggers
            }));
            
            // Clone LabelLayer for Minimap
            minimapLayers.push(new IconLayer({
                ...labelLayer.props,
                id: 'minimap-label-layer',
                sizeUnits: 'common',
                sizeScale: 1,
                getSize: d => d.style.iconSize || 20,
                updateTriggers: labelLayer.props.updateTriggers
            }));

             // Clone NodeLabelLayer for Minimap
            minimapLayers.push(new TextLayer({
                ...nodelabelLayer.props,
                id: 'minimap-node-label-layer',
                sizeUnits: 'common',
                sizeScale: 1,
                getSize: d => 15,
                updateTriggers: nodelabelLayer.props.updateTriggers
            }));
        }

        const layers = [];
        if (minimapBackgroundLayer) layers.push(minimapBackgroundLayer);
        if (minimapLayers.length > 0) layers.push(...minimapLayers);
        
        if (bubbleLayer) layers.push(bubbleLayer);
        layers.push(lineLayer, dashLineLayer, arrowLayer, rectBackgroundLayer, circleEdge, labelLayer, iconLayer, groupTextLayer, textLayer);
        if (animationLayer) layers.push(animationLayer);
        layers.push(markLayer, nodelabelLayer);
        
        if (viewportFrameLayer) layers.push(viewportFrameLayer);

        if (viewStat === null) {
            this.deck.setProps({ width: this.props.containerWidth, height: this.props.containerHeight, layers });
        } else {
            const viewState = {
                globalView: viewStat
            };
            if (this.props.minimap) {
                viewState.minimapView = this.minimapViewState;
            }

            this.deck.setProps({ 
                viewState: viewState, 
                width: this.props.containerWidth, 
                height: this.props.containerHeight, 
                layers 
            });
        }





        //this.deck.setProps({ width: this.props.containerWidth, height: this.props.containerHeight,viewState:viewState, layers: [lineLayer, arrowLayer, rectBackgroundLayer, circleEdge,  labelLayer, iconLayer, textLayer, markLayer] });
    }

    renderLockNode() {
        const zoom = this.props.zoom;
        const { renderBackgrounds, renderIcons, renderLines, renderText, renderPolygon, charSet, renderMark, renderLabels, renderDashLine } = this.renderObject;
        const lineHighlightRGB = hexRgb(this.props.lineHighlightColor);
        const lineHighlightOpactiy = this.props.lineHighlightOpacity;
        const invalidIcon = this.invalidIncons;
        const defaultUrlMap = this.props.defaultUrlMap;
        const defaultUrlFunc = this.props.defaultUrlFunc;
        const styleFlag = this.updateFlag.style;
        const positionFlag = this.updateFlag.position;
        const bubbleFlag = this.updateFlag.bubble;
        const iconFlag = this.updateFlag.icon;

        const lineLayer = new LineLayer({
            id: 'line-layer',
            data: renderLines,
            autoHighlight: true,
            highlightColor: [lineHighlightRGB.red, lineHighlightRGB.green, lineHighlightRGB.blue, lineHighlightOpactiy * 255],
            pickable: true,
            getWidth: d => d.style.lineWidth,
            getSourcePosition: d => d.sourcePosition,
            getTargetPosition: d => d.targetPosition,
            getColor: d => d.style.lineColor,
            updateTriggers: {
                getSourcePosition: d => d.sourcePosition,
                getTargetPosition: d => d.targetPosition,
            },
            onClick: this.lineClickHandler,
        });
        const dashLineLayer = new LineLayer({
            id: 'dash-line-layer',
            data: renderDashLine.filter(() => true),
            autoHighlight: true,
            highlightColor: [lineHighlightRGB.red, lineHighlightRGB.green, lineHighlightRGB.blue, lineHighlightOpactiy * 255],
            pickable: true,
            getWidth: d => d.style.lineWidth,
            getSourcePosition: d => d.sourcePosition,
            getTargetPosition: d => d.targetPosition,
            getColor: d => d.style.lineColor,
            updateTriggers: {
                getSourcePosition: positionFlag,
                getTargetPosition: positionFlag,
            },
            onClick: this.lineClickHandler,
        });
        const iconLayer = new IconLayer({
            id: 'icon-layer',
            data: renderIcons,
            pickable: true,
            coordinateSystem: COORDINATE_SYSTEM.CARTESIAN,
            getPosition: d => d.position,
            getIcon: d => ({
                url: invalidIcon.has(d.url) ? function (d) {
                    return defaultUrlMap[defaultUrlFunc(d)];
                }(d) : d.url,
                width: ICONDIM,//d.style.iconHeight,
                height: ICONDIM,//d.style.iconHeight,
                anchorX: 0,
                anchorY: 0,
            }),
            getSize: d => d.style.iconSize,//this 指向问题
            updateTriggers: {
                getPosition: d => {
                    return d.position;
                },
                getSize: d => d.style.iconSize * (2 ** zoom),

            },
        });
        const rectBackgroundLayer = new PolygonLayer({
            id: 'rect-background-layer',
            data: renderBackgrounds,
            opacity: 1,
            getFillColor: (d) => {
                if (d.status === 2) {
                    return d.style.backgroundColor;
                } else {
                    return [255, 255, 255, 0];
                }
            },
            getPolygon: (d) => {
                return d.backgroundPolygon;
            },
            getLineColor: (d) => {
                if (d.status === 2) {
                    return d.style.borderColor;
                } else {
                    return [255, 255, 255.0];
                }
            },
            getLineWidth: (d) => {
                if (d.status === 2) {
                    return d.style.borderWidth;
                } else {
                    return 0;
                }
            },
            filled: true,
            stroked: true,
            positionFormat: 'XY',
            updateTriggers: {
                getPolygon: d => {
                    return d.backgroundPolygon;
                },
                getFillColor: (d) => {
                    if (d.status === 2) {
                        return d.style.backgroundColor;
                    } else {
                        return [255, 255, 255, 0];
                    }
                },
            }
        });

        const textLayer = new TextLayer({
            id: 'text-layer',
            coordinateSystem: COORDINATE_SYSTEM.CARTESIAN,
            data: renderText,
            fontFamily: 'Microsoft YaHei',
            getPosition: d => {
                return d.position;
            },
            getText: d => {
                const len = d.text.length;
                if (len > 10) {
                    let temp = d.text.slice(0, 7);
                    temp += temp + '..'
                    return temp;
                } else {
                    return d.text;
                }
            },
            getSize: d => d.style.textSize * (2 ** zoom),
            getAngle: 0,
            getTextAnchor: d => d.style.textAnchor,
            getAlignmentBaseline: d => d.style.textAlignmentBaseline,
            characterSet: charSet,
            getColor: (d) => d.style.textColor,
            updateTriggers: {
                getPosition: positionFlag,
                getSize: zoom + styleFlag,
                getColor: styleFlag
            }
        });

        const arrowLayer = new PolygonLayer({
            id: 'arrow-layer',
            opacity: 1,
            data: renderPolygon,
            filled: true,
            stroked: true,
            getLineWidth: 1,
            getLineColor: d => d.style.polyonColor,
            getPolygon: d => {
                return d.polygon;
            },
            positionFormat: 'XY',
            getFillColor: (d) => d.style.polygonFillColor,
            updateTriggers: {
                getPolygon: d => {
                    return d.polygon;
                }
            }
        });
        const markRGB = hexRgb(this.props.nodeHighlightColor);
        const markOpactiy = this.props.nodeHighlightOpacity;
        const markLayer = new PolygonLayer({
            id: "mark-layer",
            opacity: 1,
            data: renderMark,
            pickable: true,
            filled: true,
            stroked: false,
            autoHighlight: true,
            highlightColor: [markRGB.red, markRGB.green, markRGB.blue, markOpactiy * 255],
            positionFormat: 'XY',
            getPolygon: d => {
                return [
                    [d.backgroundPolygon[0][0],d.backgroundPolygon[0][1]],
                    [d.backgroundPolygon[1][0]+d.style.borderWidth*2,d.backgroundPolygon[1][1]],
                    [d.backgroundPolygon[2][0]+d.style.borderWidth * 2,d.backgroundPolygon[2][1]+d.style.borderWidth * 2],
                    [d.backgroundPolygon[3][0],d.backgroundPolygon[3][1]+d.style.borderWidth * 2]
            ]
            },
            getFillColor: (d) => {
                if (d.status === 4) {
                    return d.style.highLightColor;
                } else {
                    return [255, 255, 255, 0];
                }
            },
            updateTriggers: {
                getFillColor: styleFlag,
                getPolygon: styleFlag + positionFlag,
            },
            onDrag: this.nodeDragingHandler,
            onClick: this.nodeClickHandler,
            onDragStart: this.nodeDragStartHandler,
            onDragEnd: this.nodeDragEndHandler,
        });
        const labelLayer = new IconLayer({
            id: 'label-layer',
            data: renderLabels.filter(() => true),
            coordinateSystem: COORDINATE_SYSTEM.CARTESIAN,
            getPosition: d => d.position,
            getIcon: d => ({
                url: d.url,
                width: d.style.iconHeight,
                height: d.style.iconHeight,
                anchorX: 0,
                anchorY: 0,
            }),
            getSize: d => d.style.iconSize,
            updateTriggers: {
                getPosition: d => {
                    return d.position;
                },
            },
            onIconError: () => {
                console.log(arguments)
            }
        })

        this.deck.setProps({ width: this.props.containerWidth, height: this.props.containerHeight, layers: [lineLayer, dashLineLayer, arrowLayer, rectBackgroundLayer, circleEdge,  labelLayer, iconLayer, textLayer, markLayer] });
    }
    renderGraph() {


        const zoom = this.props.zoom;
        const invalidIcon = this.invalidIncons;
        const { renderBackgrounds, renderIcons, renderLines, renderText, renderPolygon, charSet, renderMark, renderLabels, renderDashLine, renderBubble, renderGroupTexts, groupTextSet } = this.renderObject;
        
        const lineHighlightRGB = hexRgb(this.props.lineHighlightColor);
        const lineHighlightOpactiy = this.props.lineHighlightOpacity;

        const styleFlag = this.updateFlag.style;
        const positionFlag = this.updateFlag.position;
        const iconFlag = this.updateFlag.icon;
        const bubbleFlag = this.updateFlag.bubble;

        const defaultUrlMap = this.props.defaultUrlMap;
        const defaultUrlFunc = this.props.defaultUrlFunc;

        let bubbleLayer = null
        if (renderBubble.length > 0) {
            bubbleLayer = new SolidPolygonLayer({
                id: 'bubble-layer',
                data: renderBubble,
                positionFormat: 'XY',
                opacity:0.05,
                getPolygon: d => d.polygon,
                getFillColor: d => d.color,
                updateTriggers: {
                    getPolygon: positionFlag + bubbleFlag,

                },
            });

        }

        let animationLayer = null;
        if (this.animationData.length > 0) {
            animationLayer = new ScatterplotLayer({
                id: 'animation-layer',
                data: this.animationData,
                stroked: false,
                filled: true,
                getPosition: d => d.currentPos,
                getRadius: d => d.radius,
                getFillColor: d => d.color,
                updateTriggers: {
                    getPosition: Math.random(),
                }
            })
        }
        const lineLayer = new LineLayer({
            id: 'line-layer',
            data: renderLines.filter(() => true),
            autoHighlight: true,
            highlightColor: [lineHighlightRGB.red, lineHighlightRGB.green, lineHighlightRGB.blue, lineHighlightOpactiy * 255],
            pickable: true,
            getWidth: d => d.style.lineWidth,
            getSourcePosition: d => d.sourcePosition,
            getTargetPosition: d => d.targetPosition,
            getColor: d => d.style.lineColor,
            updateTriggers: {
                getSourcePosition: positionFlag,
                getTargetPosition: positionFlag,
                getColor: styleFlag,
            },
            onClick: this.lineClickHandler,
        });
        const dashLineLayer = new LineLayer({
            id: 'dash-line-layer',
            data: renderDashLine.filter(() => true),
            autoHighlight: true,
            highlightColor: [lineHighlightRGB.red, lineHighlightRGB.green, lineHighlightRGB.blue, lineHighlightOpactiy * 255],
            pickable: true,
            getWidth: d => d.style.lineWidth,
            getSourcePosition: d => d.sourcePosition,
            getTargetPosition: d => d.targetPosition,
            getColor: d => d.style.lineColor,
            updateTriggers: {
                getSourcePosition: positionFlag,
                getTargetPosition: positionFlag,
                getColor: styleFlag,
            },
            onClick: this.lineClickHandler,
        });
        const iconLayer = new IconLayer({
            id: 'icon-layer',
            data: renderIcons.filter(() => true),
            pickable: true,
            coordinateSystem: COORDINATE_SYSTEM.CARTESIAN,
            sizeScale: 2 ** zoom,
            getPosition: d => d.position,

            getIcon: d => {
                let url = null;
                if (invalidIcon.has(d.url)) {
                    let type = defaultUrlFunc(d);
                    url = defaultUrlMap[type];
                } else {
                    url = d.url;
                }
                return {
                    url: url,
                    width: ICONDIM,//d.style.iconHeight,
                    height: ICONDIM,//d.style.iconHeight,
                    anchorX: 0,
                    anchorY: 0,
                }
            },
            getSize: d => d.style.iconSize,//this 指向问题
            getColor: d => d.style.iconColor,

            updateTriggers: {
                getPosition: positionFlag,
                getIcon: iconFlag,
            },
            onIconError: this.onIconErrorHander,
        });

        const circleEdge = new ScatterplotLayer({
            id: 'circleedge-layer',
            data: renderBackgrounds.filter((v) => v.shapeType === 0),
            coordinateSystem: COORDINATE_SYSTEM.CARTESIAN,
            pickable: true,
            opacity: 1,
            stroked: true,
            filled: true,
            autoHighlight: false,
            getFillColor: (d) => {
                return d.style.backgroundColor || [255, 255, 255, 255];
            },
            getRadius: (d) => {
                return d.style.circleHeight / 2;
            },
            getPosition: (d) => {
                return d.position;
            },
            getLineColor: (d) => {
                if (d.status === 2) {
                    return d.style.borderColor
                } else {
                    return [255, 255, 255, 0];
                }
            },
            getLineWidth: (d) => {
                return d.style.borderWidth || 4;
            },
            getWidth: (d) => {
                return d.style.backgroundWidth;
            },
            onDrag: this.nodeDragingHandler,
            onClick: this.nodeClickHandler,
            onDragStart: this.nodeDragStartHandler,
            onDragEnd: this.nodeDragEndHandler,

        });



        // const roundedEdge = new RoundedRectangleLayer({
        //     id: 'rounded',
        //     data: renderBackgrounds.filter((v) => v.shapeType === 1 && v.status === 1),
        //     opacity: 1,
        //     getFillColor: (d) => {
        //         return d.style.backgroundColor || [255, 255, 255, 255];
        //     },
        //     getLineColor: (d) => {
        //         if (d.status === 2) {
        //             return d.style.borderColor
        //         } else {
        //             return [255, 255, 255, 0];
        //         }
        //     },
        //     getLineWidth: (d) => {
        //         if (d.status === 2) {
        //             return d.style.borderWidth || 4
        //         } else {
        //             return 0;
        //         }
        //     },
        //     getFirstScatterPosition: (d) => {
        //         return d.position;
        //     },
        //     getSecondScatterPosition: (d) => {
        //         return [d.position[0] + d.style.backgroundWidth, d.position[1]];
        //     },
        //     getPolygon: (d) => {
        //         return [[d.position[0], d.position[1] + d.style.backgroundHeight / 2], [d.position[0] + d.style.backgroundWidth, d.position[1] + d.style.backgroundHeight / 2], [d.position[0] + d.style.backgroundWidth, d.position[1] - d.style.backgroundHeight / 2], [d.position[0], d.position[1] - d.style.backgroundHeight / 2]];
        //     },
        //     getFirstPath: (d) => {
        //         return [[d.position[0] - d.style.borderWidth / 2, d.position[1] - d.style.backgroundHeight / 2], [d.position[0] + d.style.backgroundWidth + d.style.borderWidth / 2, d.position[1] - d.style.backgroundHeight / 2]];
        //     },
        //     getSecondPath: (d) => {
        //         return [[d.position[0] - d.style.borderWidth / 2, d.position[1] + d.style.backgroundHeight / 2], [d.position[0] + d.style.backgroundWidth + d.style.borderWidth / 2, d.position[1] + d.style.backgroundHeight / 2]];
        //     },
        //     getCircleRadius: (d) => {
        //         return d.style.backgroundHeight / 2;
        //     }
        // })

        const rectBackgroundLayer = new PolygonLayer({
            id: 'rect-background-layer',
            data: renderBackgrounds.filter(() => true),
            opacity: 1,
            positionFormat: 'XY',
            getFillColor: (d) => {
                if (d.status === 2) {
                    return d.style.backgroundColor;
                } else {
                    return [255, 255, 255, 0];
                }
            },
            getPolygon: (d) => {
                return d.backgroundPolygon;
            },
            getLineColor: (d) => {
                if (d.status === 2) {
                    return d.style.borderColor;
                } else {
                    return [255, 255, 255.0];
                }
            },
            getLineWidth: (d) => {
                if (d.status === 2) {
                    return d.style.borderWidth;
                } else {
                    return 0;
                }
            },
            filled: true,
            stroked: true,
            updateTriggers: {
                getPolygon: positionFlag,
                getFillColor: styleFlag,
            }
        });


        const textLayer = new TextLayer({
            id: 'text-layer',
            coordinateSystem: COORDINATE_SYSTEM.CARTESIAN,
            data: renderText.filter(() => true),
            sizeScale: 2 ** zoom,
            fontFamily: 'Microsoft YaHei',
            getPosition: d => {
                return d.position;
            },
            getText: d => d.text,
            getSize: d => d.style.textSize,
            getAngle: 0,
            getTextAnchor: d => d.style.textAnchor,
            getAlignmentBaseline: d => d.style.textAlignmentBaseline,
            characterSet: charSet,
            getColor: (d) => d.style.textColor,
            updateTriggers: {
                getPosition: positionFlag,
                getSize: styleFlag,
                getColor: styleFlag
            }
        });
        const groupTextLayer = new TextLayer({
            id: 'group-text-layer',
            coordinateSystem: COORDINATE_SYSTEM.CARTESIAN,
            data: renderGroupTexts.filter(() => true),
            pickable: true,
            maxWidth: 360,
            sizeScale: 2 ** zoom,
            wordBreak: 'break-all',
            fontFamily: 'Microsoft YaHei',
            getPosition: d => {
                return d.position;
            },
            getText: d => {
                return d.text;
            },
            getSize: d => d.style.textSize,
            getAngle: 0,
            getTextAnchor: d => d.style.textAnchor,
            getAlignmentBaseline: d => d.style.textAlignmentBaseline,
            characterSet: groupTextSet,
            getColor: (d) => d.style.textColor,
            updateTriggers: {
                getPosition: positionFlag,
                getSize: styleFlag,
                getColor: styleFlag
            }
        });

        const arrowLayer = new PolygonLayer({
            id: 'arrow-layer',
            opacity: 1,
            data: renderPolygon.filter(() => true),
            filled: true,
            stroked: true,
            positionFormat: 'XY',
            getLineWidth: 1,
            getLineColor: d => d.style.polygonFillColor,
            getPolygon: d => {
                return d.polygon;
            },
            getFillColor: (d) => d.style.polygonFillColor,
            updateTriggers: {
                getFillColor: styleFlag,
            }
        });
        const markRGB = hexRgb(this.props.nodeHighlightColor);
        const markOpactiy = this.props.nodeHighlightOpacity;
        const markLayer = new PolygonLayer({
            id: "mark-layer",
            opacity: 1,
            data: renderMark.filter(() => true),
            pickable: true,
            filled: true,
            stroked: false,
            autoHighlight: true,
            positionFormat: 'XY',
            highlightColor: [markRGB.red, markRGB.green, markRGB.blue, markOpactiy * 255],
            getPolygon: d => d.backgroundPolygon,
            getFillColor: (d) => {
                if (d.status === 4) {
                    return d.style.highLightColor;
                } else {
                    return [255, 255, 255, 0];
                }
            },
            updateTriggers: {
                getFillColor: styleFlag,
                getPolygon: styleFlag + positionFlag,
            },
            onDrag: this.nodeDragingHandler,
            onClick: this.nodeClickHandler,
            onDragStart: this.nodeDragStartHandler,
            onDragEnd: this.nodeDragEndHandler,
        });
        const labelLayer = new IconLayer({
            id: 'label-layer',
            data: renderLabels.filter(() => true),
            coordinateSystem: COORDINATE_SYSTEM.CARTESIAN,
            sizeScale: 2 ** zoom,
            getPosition: d => d.position,
            getIcon: d => ({
                url: d.url,
                width: d.style.iconHeight,
                height: d.style.iconHeight,
                anchorX: 0,
                anchorY: 0,
            }),
            getSize: d => d.style.iconSize,//this 指向问题
            updateTriggers: {
                getPosition: positionFlag,
            },
            onIconError: () => {
                console.log(arguments)
            }
        });
        const nodelabelLayer = new TextLayer({
            id: 'node-label-layer',
            coordinateSystem: COORDINATE_SYSTEM.CARTESIAN,
            data: renderGroupTexts.filter(() => true),
            background: true,
            backgroundPadding: [5, 2, 5, 2],
            sizeScale: 2 ** zoom,
            fontFamily: 'Microsoft YaHei',
            getPosition: d => {
                return [d.position[0] + d.style.backgroundWidth/4, d.position[1] - d.style.backgroundHeight];
            },
            getText: d => "节点数:10",
            getSize: d => 15,
            getAngle: 0,
            getTextAnchor: d => d.style.textAnchor,
            getAlignmentBaseline: d => d.style.textAlignmentBaseline,
            characterSet: ['节','点','数',':','1','0'],
            getColor: (d) => [50, 65, 137, 255],
            getBackgroundColor: (d) => {
                return [255,140,0,255];
            },
            updateTriggers: {
                getPosition: positionFlag,
                getSize: styleFlag,
                getColor: styleFlag
            }
        });

        if (renderBubble.length > 0 && this.animationData.length > 0) {
            this.deck.setProps({ width: this.props.containerWidth, height: this.props.containerHeight, layers: [bubbleLayer, lineLayer, dashLineLayer, arrowLayer, rectBackgroundLayer, circleEdge,  labelLayer, iconLayer, groupTextLayer, textLayer, animationLayer, markLayer,
                 nodelabelLayer] });
        } else if (renderBubble.length > 0) {
            this.deck.setProps({ width: this.props.containerWidth, height: this.props.containerHeight, layers: [bubbleLayer, lineLayer, dashLineLayer, arrowLayer, rectBackgroundLayer, circleEdge,  labelLayer, iconLayer, groupTextLayer, textLayer, markLayer, 
                nodelabelLayer] });
        } else if (this.animationData.length > 0) {
            this.deck.setProps({ width: this.props.containerWidth, height: this.props.containerHeight, layers: [lineLayer, dashLineLayer, arrowLayer, rectBackgroundLayer, circleEdge,  labelLayer, iconLayer, groupTextLayer, textLayer, animationLayer, markLayer, 
                nodelabelLayer] });
        } else {
            this.deck.setProps({ width: this.props.containerWidth, height: this.props.containerHeight, layers: [lineLayer, dashLineLayer, arrowLayer, rectBackgroundLayer, circleEdge,  labelLayer, iconLayer, groupTextLayer, textLayer, markLayer, 
                nodelabelLayer] });
        }
        // if (this.animationData.length > 0) {
        //     this.deck.setProps({ width: this.props.containerWidth, height: this.props.containerHeight, layers: [lineLayer,dashLineLayer, arrowLayer, rectBackgroundLayer, circleEdge,  labelLayer, iconLayer, textLayer, animationLayer, markLayer] });
        // } else {
        //     this.deck.setProps({ width: this.props.containerWidth, height: this.props.containerHeight, layers: [lineLayer,dashLineLayer, arrowLayer, rectBackgroundLayer, circleEdge,  labelLayer, iconLayer, textLayer, markLayer] });
        // }


    }

    _nodeClickHandler(info, e) {

        if (!e.leftButton) {
            this.eventController.fire('nodeLeftClick', [info, e]);
            if (this.props.nodeRightClick) {
                this.props.nodeRightClick(info, e);
            }
            return true;
        }
        if (e.srcEvent.ctrlKey) {
            this.eventController.fire('nodeClickWithCtrl', [info, e]);
            return true;
        }
        this.eventController.fire('nodeClick', [info, e]);
        // if (info.object.status === 1) {
        //     this.elementController.updateNodeStatus([info.object.id], 2);
        // } else if (info.object.status === 2) {
        //     this.elementController.updateNodeStatus([info.object.id], 1);
        // }
        return true;
    }

    _nodeDragStartHandler(info, e) {
        this.eventController.fire('nodeDragStart', [info, e]);
        return true;
    }
    _iconErrorHander({ url }) {
        this.invalidIncons.set(url, true);
        if (this.updateFlag.iconTimer) {
            clearTimeout(this.updateFlag.iconTimer);
            this.updateFlag.iconTimer = null;
        }
        this.updateFlag.iconTimer = setTimeout(() => {
            this.updateFlag.icon = Math.random();
            this.updateRenderGraph()
        }, 1000);

    }


    _nodeDragingHandler(info, e) {
        if (info.object.origionElement.isLocked) {
            return true
        }
        if (!this.dragDoune) {

            this.dragDoune = true;
            this.elementController.updateNodeLocation([info.object.id], { x: parseFloat((e.offsetCenter.x - info.object.style.backgroundWidth / 2) * (2 ** -this.props.zoom) + (this.props.viewState.target[0] - this.props.initTarget[0] * (2 ** -this.props.zoom))), y: parseFloat((e.offsetCenter.y - info.object.style.backgroundHeight / 2) * (2 ** -this.props.zoom) + (this.props.viewState.target[1] - this.props.initTarget[1] * (2 ** -this.props.zoom))) }, this.groupDrag);

            this.eventController.fire('nodeDraging', [info, e]);
            setTimeout(() => {
                this.dragDoune = false;
            }, 100)
        }

        return true;
    }

    _nodeDragEndHandler(info, e) {
        //this.elementController.updateNodeLocation([info.object.id], { x: parseInt(e.deltaX) * (2 ** -this.props.zoom), y: parseInt(e.deltaY) * (2 ** -this.props.zoom) });
        this.eventController.fire('nodeDragEnd', [info, e]);
        return true;
    }
    _nodeHoverHandler(info, e) {
        return true;
    }


    _lineClickHandler(info, e) {
        if (e.srcEvent.ctrlKey) {
            this.eventController.fire('lineClickWithCtrl', [info, e]);
            return true;
        } 
        this.eventController.fire('lineClick', [info, e]);
        return true;
    }
    _lineHoverHandler(info, e) {
        return true;
    }

    pickObject(pickField) {
        const pickedObjects = this.deck.pickObjects({ x: pickField.startX, y: pickField.startY, width: pickField.width, height: pickField.height, layerIds: ['mark-layer'] });
        const nodeIds = new Set();
        if (pickedObjects && pickedObjects.length > 0) {
            pickedObjects.forEach((obj) => {
                nodeIds.add(obj.object.id);
            });
        }
        return Array.from(nodeIds);
    }

    setZoom(zoom) {
        if (zoom >= this.props.minZoom && zoom <= this.props.maxZoom) {
            let viewState = {
                target: this.props.viewState.target,
                rotationX: 0,
                rotationOrbit: 0,
                zoom: zoom,
            }
            this.props.zoom = zoom;
            this.viewState = viewState;
            this.deck.setProps({ viewState });
            this.updateRenderGraph();
        }
    }
    /**
     * 当前画布的缩放级别
     * @returns number
     */
    getZoom() {
        return this.props.zoom;
    }

    /**
     * 控制多个结点同时拖拽
     * @param {boolean} v 
     */
    setGroupDrag(v) {
        if (typeof v === 'boolean') {
            this.groupDrag = v;
        }
    }

    /**
     * 更新渲染对象并在画布重新绘制改变的元素
     * @param {{rederObject,position,style,bubble}} param0 更新的渲染对象和更新的原因
     */
    updateRenderObject({ renderObject, position, style, bubble }) {
        if (renderObject) {
            this.renderObject = renderObject;
            this.renderObject.charSet.push('.')
            this.renderGraph();
        } else {
            if (position) {
                this.updateFlag.position = Math.random();
            }
            if (style) {
                this.updateFlag.style = Math.random();
            }
            if (bubble) {
                this.updateFlag.bubble = Math.random();
            }
            this.updateRenderGraph();
        }
    }
    /**
     * 实时更新动画
     */
    updateAmination() {
        this.updateRenderGraph();
    }

    /**
     * 更新锁定的结点
     * @param {Object} renderObject 渲染对象
     */
    updateLockNode(renderObject) {
        this.renderObject = renderObject;
        this.renderLockNode();
    }
    /**
     * 将ElementController 挂载到CanvasController
     * @param {ElementController} elementController y
     */
    mountElementController(elementController) {
        this.elementController = elementController;
    }
    /**
     * 开启Brush 区域
     */
    showBrushArea() {
        let brushProps = {
            width: this.props.containerWidth,
            height: this.props.containerHeight,
            viewState: this.props.viewState,
            container: this.props.container,
            zoom: this.props.zoom,
            eventController: this.eventController
        }

        if (this.brushCanvas) {
            this.brushCanvas.showBrushArea(brushProps);
        } else {
            this.brushCanvas = new BrushCanvas(brushProps);
            this.brushCanvas.showBrushArea(brushProps);
        }
        this.eventController.subscribe('_brushend', this._brushInfoCallBack)
    }

    /**
     * bush 结果回调
     * @param {{x:number,y:number,width:number,height:numebr}} brushInfo 
     */
    _brushInfoCallBack(brushInfo) {


        let nodeIds = this.pickObject(brushInfo);
        //this.elementController.updateNodeStatus(nodeIds, 2);
        this.eventController.fire('brush', [nodeIds]);
        this.eventController.unSubscribeByName('_brushend');
    }
    /**
     * 将画布导出为Base64
     * @returns base64
     */
    exportCanvasAsBase64() {
        this.deck.redraw(true);
        return this.deck.canvas.toDataURL();
    }

    /**
     * 更新画布的尺寸
     * @param {{width,height}} param0 Canvas 宽度和高度
     */
    updateDim({ width, height }) {
        this.props.containerWidth = width;
        this.props.containerHeight = height;
        const initViewState = {
            target: [this.props.containerWidth / 2, this.props.containerHeight / 2, 0],
            rotationX: 0,
            rotationOrbit: 0,
            zoom: this.props.zoom,
        }
        this.props.viewState = initViewState;
        this.props.initTarget = initViewState.target;

        const views = [
            new OrthographicView({
                id: 'globalView',
                x: 0,
                y: 0,
                width: '100%',
                height: '100%',
                maxZoom: this.props.maxZoom,
                minZoom: this.props.minZoom,
                controller: true,
                doubleClickZoom: false,
            })
        ];

        if (this.props.minimap) {
            views.push(new OrthographicView({
                id: 'minimapView',
                x: this.props.containerWidth - MINIMAP_SIZE - MINIMAP_MARGIN,
                y: this.props.containerHeight - MINIMAP_SIZE - MINIMAP_MARGIN,
                width: MINIMAP_SIZE,
                height: MINIMAP_SIZE,
                clear: true,
                controller: {
                    scrollZoom: true,
                    dragPan: true,
                    dragRotate: false,
                    doubleClickZoom: false,
                    touchZoom: true,
                    touchRotate: false,
                    keyboard: false
                }
            }));
        }

        const viewState = {
            globalView: this.props.viewState
        };
        if (this.props.minimap) {
            viewState.minimapView = this.minimapViewState;
        }

        this.deck.setProps({
            width: width, 
            height: height, 
            views: views,
            viewState: this.props.minimap ? viewState : this.props.viewState,
        })

        this.deck.redraw(true);

    }
    /**
     * 获取当前画布的宽度和高度
     * @returns {width,height}
     */
    getDim() {
        return {
            width: this.props.containerWidth,
            height: this.props.containerHeight,
        }
    }
    /**
     * 调整画布的聚焦点和缩放层级
     * @param {{target:Array<number>,zoom:number}} params 视图状态参数
     * @returns 
     */
    fitView(params) {
        if(this.isJustDraged){
            return
        }
        try {
            if (Number.isNaN(params.target[0]) || params.target === undefined) {
                params.target[0] = this.props.viewState.target[0];
            }
            if (Number.isNaN(params.target[1]) || params.target === undefined) {
                params.target[1] = this.props.viewState.target[1];
            }
            if (Number.isNaN(params.zoom) || params.zoom === undefined) {
                params.zoom = this.props.zoom;
            }
            if (params.zoom < this.props.minZoom) {
                params.zoom = this.props.minZoom;
            }
            let isNeedUpdate = false;
            if (params.zoom !== this.props.zoom) {
                isNeedUpdate = true;
            }
            this.props.viewState.target = [params.target[0], params.target[1], 0];
            this.props.viewState.zoom = params.zoom;
            this.props.zoom = params.zoom;
            // let viewStat = JSON.parse(JSON.stringify(this.props.viewState));
            let viewStat = Object.assign({}, this.props.viewState);
            viewStat.minZoom = -4;
            viewStat.maxZoom = 4 + Math.random();
            if (!viewStat) {
                return
            }
            this.props.viewState = viewStat;

           // if (isNeedUpdate) {
                this.updateRenderGraph(viewStat);
          //  }
        } catch (err) {
            console.log(params, this.viewState);
            throw err;
        }

    }

    /**
     * 移动canvas的聚焦位置到某一个点
     * @param {Array<number>} target 移动到的canvas的具体的位置
     */
    scrollIntoView(target) {

        this.props.viewState.target = [target[0], target[1], 0];
        const viewStat = JSON.parse(JSON.stringify(this.props.viewState))
        viewStat.minZoom = -Infinity;
        viewStat.maxZoom = Infinity;
        this.deck.setProps({ viewState: viewStat })
    }
    /**
     * 更新动画数据
     * @param {Array} animationData 动画控制数据
     */
    updateAnimationData(animationData) {

        this.animationData = animationData;
        if (this.animationData.length <= 0) {
            this.updateRenderGraph();
        }
    }
    /**
     * 为错误url指定默认url
     * @param {Object} defaultUrlMap type 到 url 映射
     */
    replaceDefaultUrlMap(defaultUrlMap) {
        this.props.defaultUrlMap = defaultUrlMap;
        this.renderGraph();
    }


    updateConstantParams(params){
        if(params.nodeHighlightColor){
            this.props.nodeHighlightColor=params.nodeHighlightColor;
        }
        if(params.nodeHighlightOpacity){
            this.props.nodeHighlightOpacity=params.nodeHighlightOpacity;
        }
        if(params.lineHighlightColor){
            this.props.lineHighlightColor=params.lineHighlightColor;
        }
        if(params.lineHighlightOpactiy){
            this.props.lineHighlightOpacity=params.lineHighlightOpacity;
        }
        this.renderGraph();
    }
}