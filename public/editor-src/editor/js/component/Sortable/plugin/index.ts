import {
  closest,
  elementDepth,
  events,
  elementIndex,
  pointDistance,
  addClass,
  removeClass,
  isInsideRect,
  clamp,
  rectCenter,
  pointRelative
} from "./utils";
import { SortablePluginOptions, GlobalState } from "./types";

const defaults: SortablePluginOptions = {
  acceptElements: [],
  isGrid: false,
  showLines: true,
  distance: 5,
  blindZone: {
    left: -Infinity,
    right: -Infinity,
    top: -Infinity,
    bottom: -Infinity
  },
  dragOffset: {
    top: 0,
    left: 0
  },
  chosenClass: "sortable-chosen",
  receiverClass: "sortable-receiver",
  hoveredClass: "sortable-hovered",
  hoveredClassTop: "sortable-hovered-top",
  hoveredClassBottom: "sortable-hovered-bottom",
  hoveredClassLeft: "sortable-hovered-left",
  hoveredClassRight: "sortable-hovered-right",
  helperClass: "sortable-helper",
  placeholderClass: "sortable-placeholder",
  cancelClass: "sortable-cancel",
  onBeforeStart: undefined,
  onStart: undefined,
  onSort: undefined,
  onEnd: undefined
};
const globalState: GlobalState = {
  allSortables: [],
  sortableInfo: new WeakMap(),
  dragInfo: {
    dragInProgress: false
  }
};

export default class SortablePlugin {
  options: SortablePluginOptions;

  el: HTMLElement;

  document: Document;

  helper: HTMLElement;

  helperRect: DOMRect;

  constructor(el: HTMLElement, options: Partial<SortablePluginOptions>) {
    // options
    {
      const tmp: { [k: string]: unknown } = {};
      for (const [key, value] of Object.entries(options)) {
        if (value !== null && value !== undefined) {
          tmp[key] = value;
        }
      }
      this.options = { ...defaults, ...tmp };
    }

    // instance fields
    this.el = el;
    this.document = this.el.ownerDocument || document;

    // sortableInfo
    let zIndex = 0;
    closest(this.el, el => {
      if (el.hasAttribute("data-sortable-zindex")) {
        // this is done in unlikely case that an element
        // with sortableZIndex is located inside another such element
        zIndex += Number(el.getAttribute("data-sortable-zindex"));
      }
      return false;
    });
    globalState.sortableInfo.set(this.el, {
      depth: elementDepth(this.el),
      zIndex: zIndex,
      isGrid: this.options.isGrid,
      acceptElements: this.options.acceptElements ?? []
    });

    // helper
    this.helper = this.document.createElement("div");
    this.helper.className = this.options.helperClass;
    this.helper.style.position = "fixed";
    this.helper.style.zIndex = "1000000";
    this.helper.style.top = "0";
    this.helper.style.left = "0";
    this.helper.style.willChange = "transform";
    this.helperRect = this.helper.getBoundingClientRect();

    this.registerSortable();
    this.attachContainerEvents();
  }

  destroy(): void {
    this.detachContainerEvents();
    this.detachPendingEvents();
    this.detachSortEvents();
    this.unregisterSortable();
  }

  // register / unregister

  registerSortable(): void {
    globalState.allSortables.push(this.el);
  }

  unregisterSortable(): void {
    const index = globalState.allSortables.indexOf(this.el);
    if (index !== -1) {
      globalState.allSortables.splice(index, 1);
    }
  }

  // handlers

  handleContainerStart = (e: MouseEvent): void => {
    if (globalState.dragInfo.dragInProgress) {
      return; // another drag in progress
    }

    if (e.button !== 0) {
      return; // only left mouse button
    }

    if (
      !(
        this.document.defaultView &&
        e.target instanceof this.document.defaultView.Element
      )
    ) {
      return;
    }

    const { cancelClass, distance, onBeforeStart } = this.options;

    const targetCancels = closest(e.target, el =>
      el.classList.contains(cancelClass)
    );
    if (targetCancels) {
      return; // dnd cancelled
    }

    const sortableElement = closest(e.target, el =>
      el.hasAttribute("data-sortable-element")
    );
    if (!sortableElement) {
      return; // invalid or missing sortable element. It happened sometimes although not sure why
    }

    const usesHandle = sortableElement.hasAttribute("data-sortable-use-handle");
    if (usesHandle) {
      const targetInsideHandle = closest(e.target, el =>
        el.hasAttribute("data-sortable-handle")
      );

      if (targetInsideHandle === undefined) {
        return; // not on handle
      }
    }

    if (distance) {
      if (onBeforeStart) {
        const data = {
          defaultPrevented: false,
          preventDefault(): void {
            this.defaultPrevented = true;
          }
        };
        onBeforeStart(data);

        if (data.defaultPrevented) {
          return;
        }
      }

      globalState.dragInfo.dragInProgress = true;
      globalState.dragInfo.source = {
        sourceSortable: this.el,
        sourceElement: sortableElement,
        sourceElementIndex: elementIndex(sortableElement),
        sourceTouch: {
          clientX: e.clientX,
          clientY: e.clientY
        }
      };

      this.attachPendingEvents();
    } else {
      throw Error("Not implemented yet. No distance");
    }
  };

  handlePendingMove = (e: MouseEvent): void => {
    if (globalState.dragInfo.source === undefined) {
      return;
    }

    const { sourceTouch } = globalState.dragInfo.source;
    const { distance } = this.options;

    const delta = pointDistance(
      sourceTouch.clientX,
      sourceTouch.clientY,
      e.clientX,
      e.clientY
    );

    if (delta > distance) {
      this.detachPendingEvents();
      this.handleSortStart(e);
    }
  };

  handlePendingEnd = (): void => {
    this.detachPendingEvents();
    this.resetDragInfo();
  };

  handleSortStart = (e: MouseEvent): void => {
    if (globalState.dragInfo.source === undefined) {
      return;
    }

    const { chosenClass, receiverClass, showLines, onStart } = this.options;

    this.addHelper(e);

    // dragInfo
    globalState.dragInfo.receiverSortables = this.findReceiverSortables();
    showLines &&
      globalState.dragInfo.receiverSortables.forEach(node =>
        addClass(node, receiverClass)
      );
    addClass(globalState.dragInfo.source.sourceElement, chosenClass);

    onStart?.();
    this.attachSortEvents();
  };

  handleSortMove = (e: MouseEvent): void => {
    this.updateHelperPosition(e);
    this.updateDragInfo(e);
  };

  handleSortEnd = (): void => {
    const { onSort, onEnd } = this.options;
    const { source, target } = globalState.dragInfo;

    this.detachSortEvents();
    this.resetDragInfoClasses();
    this.removeHelper();
    this.resetDragInfo();

    if (onSort && source && target) {
      const { sourceSortable, sourceElement, sourceElementIndex } = source;
      const { targetSortable, targetElementIndex } = target;
      const sourceElementType =
        sourceElement.getAttribute("data-sortable-type") ?? "";

      onSort({
        from: {
          sortableNode: sourceSortable,
          elementNode: sourceElement,
          elementIndex: sourceElementIndex,
          elementType: sourceElementType
        },
        to: {
          sortableNode: targetSortable,
          elementIndex: targetElementIndex
        }
      });
    }

    onEnd?.();
  };

  // helper

  addHelper(e: MouseEvent): void {
    this.document.body.appendChild(this.helper);
    this.helperRect = this.helper.getBoundingClientRect();
    this.updateHelperPosition(e);
  }

  updateHelperPosition(e: MouseEvent): void {
    const x = e.clientX - this.helperRect.width / 2;
    const y = e.clientY - this.helperRect.height / 2;
    this.helper.style.transform = `translate(${x}px,${y}px)`;
  }

  removeHelper(): void {
    this.helper.parentElement?.removeChild(this.helper);
  }

  // dragInfo

  updateDragInfo(e: MouseEvent): void {
    if (globalState.dragInfo.source === undefined) {
      return;
    }

    const {
      hoveredClass,
      hoveredClassTop,
      hoveredClassBottom,
      hoveredClassLeft,
      hoveredClassRight,
      blindZone,
      showLines,
      dragOffset
    } = this.options;
    const x = e.clientX + dragOffset.left;
    const y = e.clientY + dragOffset.top;

    if (globalState.dragInfo.target?.targetElement) {
      const targetElement = globalState.dragInfo.target.targetElement;

      removeClass(
        targetElement,
        hoveredClass,
        hoveredClassTop,
        hoveredClassBottom,
        hoveredClassLeft,
        hoveredClassRight
      );

      if (targetElement.previousElementSibling) {
        removeClass(
          targetElement.previousElementSibling,
          hoveredClass,
          hoveredClassTop,
          hoveredClassBottom
        );
      }
    }

    globalState.dragInfo.target = undefined;

    if (isInsideRect(x, y, blindZone)) {
      return;
    }

    const closestSortable = this.findClosestSortable(x, y);
    if (closestSortable) {
      const closestSortableInfo = globalState.sortableInfo.get(closestSortable);
      if (closestSortableInfo === undefined) {
        return;
      }

      const { sourceElement } = globalState.dragInfo.source;

      if (sourceElement.contains(closestSortable)) {
        return;
      }

      const closestElement = this.findClosestElement(x, y, closestSortable);
      if (closestElement === sourceElement) {
        return;
      }

      // sortable
      const targetSortable = closestSortable;

      // element
      const targetElement = closestElement;

      // index
      let targetElementIndex = 0;

      if (targetElement) {
        const {
          sourceSortable,
          sourceElement,
          sourceElementIndex
        } = globalState.dragInfo.source;
        const { x: centerX, y: centerY } = rectCenter(
          targetElement.getBoundingClientRect()
        );
        const { isAbove, isLeft } = pointRelative(
          e.clientX,
          e.clientY,
          centerX,
          centerY
        );
        const isGrid = closestSortableInfo.isGrid;

        const isBefore = isGrid ? isLeft : isAbove;
        targetElementIndex = elementIndex(targetElement) + (isBefore ? 0 : 1);
        if (
          targetSortable === sourceSortable &&
          targetElementIndex > sourceElementIndex
        ) {
          targetElementIndex -= 1;
        }

        let targetElementForClassName = targetElement;
        let hoveredClassPosition = "";
        if (isGrid) {
          if (isLeft) {
            hoveredClassPosition = hoveredClassLeft;
          } else {
            hoveredClassPosition = hoveredClassRight;
          }
        } else {
          if (isAbove) {
            const previousSibling =
              targetElementForClassName.previousElementSibling;

            if (!previousSibling || previousSibling === sourceElement) {
              hoveredClassPosition = hoveredClassTop;
            } else {
              targetElementForClassName = previousSibling;
              hoveredClassPosition = hoveredClassBottom;
            }
          } else {
            hoveredClassPosition = hoveredClassBottom;
          }
        }

        showLines &&
          addClass(
            targetElementForClassName,
            hoveredClass,
            hoveredClassPosition
          );
      }

      globalState.dragInfo.target = {
        targetSortable,
        targetElement,
        targetElementIndex
      };
    }
  }

  resetDragInfo(): void {
    globalState.dragInfo = {
      dragInProgress: false
    };
  }

  resetDragInfoClasses(): void {
    const {
      receiverClass,
      chosenClass,
      hoveredClass,
      hoveredClassTop,
      hoveredClassBottom,
      hoveredClassLeft,
      hoveredClassRight
    } = this.options;
    const { source, target, receiverSortables } = globalState.dragInfo;

    if (receiverSortables) {
      receiverSortables.forEach(node => removeClass(node, receiverClass));
    }

    if (source) {
      removeClass(source.sourceElement, chosenClass);
    }

    if (target?.targetElement) {
      removeClass(
        target.targetElement,
        hoveredClass,
        hoveredClassTop,
        hoveredClassBottom,
        hoveredClassLeft,
        hoveredClassRight
      );

      target.targetElement.previousElementSibling &&
        removeClass(
          target.targetElement.previousElementSibling,
          hoveredClass,
          hoveredClassTop,
          hoveredClassBottom
        );
    }
  }

  findReceiverSortables(): Element[] {
    if (globalState.dragInfo.source === undefined) {
      return [];
    }

    const { sourceSortable, sourceElement } = globalState.dragInfo.source;
    const sourceElementType =
      sourceElement.getAttribute("data-sortable-type") ?? "";

    return globalState.allSortables.filter(node => {
      if (
        node.getAttribute("data-sortable-disabled") === "true" ||
        node.closest("[data-sortable-disabled='true']")
      ) {
        return false;
      }

      const sortableInfo = globalState.sortableInfo.get(node);
      if (sortableInfo === undefined) {
        return false;
      }

      // call custom filter callback if provided
      if (typeof sortableInfo.acceptElements === "function") {
        const from = {
          sortableNode: sourceSortable,
          elementNode: sourceElement,
          elementType: sourceElementType
        };
        const to = {
          sortableNode: node
        };

        return sortableInfo.acceptElements(from, to);
      }

      return (
        sortableInfo.acceptElements === "*" ||
        (Array.isArray(sortableInfo.acceptElements) &&
          sortableInfo.acceptElements.includes(sourceElementType))
      );
    });
  }

  findClosestSortable(x: number, y: number): Element | undefined {
    // get the most deep sortable that contains the point
    const closest = globalState.dragInfo.receiverSortables?.reduce<{
      node: Element | undefined;
      depth: number;
      zIndex: number;
    }>(
      (acc, node) => {
        const sortableInfo = globalState.sortableInfo.get(node);

        if (sortableInfo && isInsideRect(x, y, node.getBoundingClientRect())) {
          const zIndex = sortableInfo.zIndex;
          const depth = sortableInfo.depth;

          if (
            zIndex > acc.zIndex ||
            (zIndex === acc.zIndex && depth > acc.depth)
          ) {
            acc.node = node;
            acc.depth = depth;
            acc.zIndex = zIndex;
          }
        }

        return acc;
      },
      { node: undefined, depth: -1, zIndex: -1 }
    );

    return closest?.node;
  }

  findClosestElement(
    x: number,
    y: number,
    sortable: Element
  ): Element | undefined {
    const nodes = Array.from(sortable.children);

    if (nodes.length === 0) {
      return undefined;
    } else if (nodes.length === 1) {
      return nodes[0];
    } else {
      return nodes.reduce<{
        node: Element | undefined;
        distance: number;
      }>(
        (acc, node) => {
          const rect = node.getBoundingClientRect();
          const x2 = clamp(x, rect.left, rect.right);
          const y2 = clamp(y, rect.top, rect.bottom);
          const distance = pointDistance(x, y, x2, y2);

          if (distance < acc.distance) {
            acc.node = node;
            acc.distance = distance;
          }

          return acc;
        },
        {
          node: undefined,
          distance: Infinity
        }
      ).node;
    }
  }

  // DOM events

  attachContainerEvents(): void {
    events.start.forEach(eventName =>
      this.el.addEventListener(eventName, this.handleContainerStart, false)
    );
  }

  detachContainerEvents(): void {
    events.start.forEach(eventName =>
      this.el.removeEventListener(eventName, this.handleContainerStart, false)
    );
  }

  attachPendingEvents(): void {
    events.move.forEach(eventName =>
      this.document.addEventListener(eventName, this.handlePendingMove, false)
    );

    events.end.forEach(eventName =>
      this.document.addEventListener(eventName, this.handlePendingEnd, false)
    );
  }

  detachPendingEvents(): void {
    events.move.forEach(eventName =>
      this.document.removeEventListener(
        eventName,
        this.handlePendingMove,
        false
      )
    );

    events.end.forEach(eventName =>
      this.document.removeEventListener(eventName, this.handlePendingEnd, false)
    );
  }

  attachSortEvents(): void {
    events.move.forEach(eventName =>
      this.document.addEventListener(eventName, this.handleSortMove, false)
    );

    events.end.forEach(eventName =>
      this.document.addEventListener(eventName, this.handleSortEnd, false)
    );
  }

  detachSortEvents(): void {
    events.move.forEach(eventName =>
      this.document.removeEventListener(eventName, this.handleSortMove, false)
    );

    events.end.forEach(eventName =>
      this.document.removeEventListener(eventName, this.handleSortEnd, false)
    );
  }
}
