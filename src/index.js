const { JSDOM, VirtualConsole } = require("jsdom");

const GLOBAL_KEYS = [
	"window",
	"navigator",
	"document",
	"requestAnimationFrame",
	"cancelAnimationFrame",
	"setTimeout",
	"clearTimeout",
	"setInterval",
	"clearInterval"
];

function captureGlobals() {
	return GLOBAL_KEYS.reduce((snapshot, key) => {
		snapshot[key] = Object.getOwnPropertyDescriptor(global, key);
		return snapshot;
	}, {});
}

function setGlobal(key, value) {
	Object.defineProperty(global, key, {
		value,
		configurable: true,
		writable: true
	});
}

function restoreGlobals(snapshot) {
	for (const key of GLOBAL_KEYS) {
		if (snapshot[key]) {
			Object.defineProperty(global, key, snapshot[key]);
		} else {
			delete global[key];
		}
	}
}

function createTimerTracker() {
	const timeouts = new Set();
	const intervals = new Set();
	const nativeSetTimeout = global.setTimeout.bind(global);
	const nativeClearTimeout = global.clearTimeout.bind(global);
	const nativeSetInterval = global.setInterval.bind(global);
	const nativeClearInterval = global.clearInterval.bind(global);

	function setTrackedTimeout(callback, delay, ...args) {
		let id;
		id = nativeSetTimeout(() => {
			timeouts.delete(id);
			callback(...args);
		}, delay);
		timeouts.add(id);
		return id;
	}

	function clearTrackedTimeout(id) {
		timeouts.delete(id);
		nativeClearTimeout(id);
	}

	function setTrackedInterval(callback, delay, ...args) {
		const id = nativeSetInterval(callback, delay, ...args);
		intervals.add(id);
		return id;
	}

	function clearTrackedInterval(id) {
		intervals.delete(id);
		nativeClearInterval(id);
	}

	function clearAll() {
		for (const id of timeouts) {
			nativeClearTimeout(id);
		}

		for (const id of intervals) {
			nativeClearInterval(id);
		}

		timeouts.clear();
		intervals.clear();
	}

	return {
		setTimeout: setTrackedTimeout,
		clearTimeout: clearTrackedTimeout,
		setInterval: setTrackedInterval,
		clearInterval: clearTrackedInterval,
		clearAll
	};
}

function installCanvasMock(window) {
	window.HTMLCanvasElement.prototype.getContext = function () {
		return {
			fillRect: function () {},
			clearRect: function () {},
			getImageData: function (x, y, w, h) {
				return {
					data: new Array(w * h * 4)
				};
			},
			putImageData: function () {},
			createImageData: function () {
				return [];
			},
			setTransform: function () {},
			drawImage: function () {},
			save: function () {},
			restore: function () {},
			beginPath: function () {},
			moveTo: function () {},
			lineTo: function () {},
			closePath: function () {},
			stroke: function () {},
			translate: function () {},
			scale: function () {},
			rotate: function () {},
			arc: function () {},
			fill: function () {},
			measureText: function () {
				return {
					width: 0
				};
			},
			transform: function () {},
			rect: function () {},
			clip: function () {},

			fillStyle: "",
			strokeStyle: "",
			lineWidth: 0,
			lineCap: "",
			lineJoin: "",
			miterLimit: 0,
			globalAlpha: 0,
			canvas: this
		};
	};
}

let renderQueue = Promise.resolve();

async function render(animationData, opts, frameNumber) {
	const globals = captureGlobals();
	const timers = createTimerTracker();
	const virtualConsole = new VirtualConsole();
	const { window } = new JSDOM("<!DOCTYPE html><body></body>", {
		pretendToBeVisual: true,
		virtualConsole
	});

	const { document, navigator } = window;
	const requestAnimationFrame =
		typeof window.requestAnimationFrame === "function"
			? window.requestAnimationFrame.bind(window)
			: callback => timers.setTimeout(callback, 1000 / 60);
	const cancelAnimationFrame =
		typeof window.cancelAnimationFrame === "function"
			? window.cancelAnimationFrame.bind(window)
			: id => timers.clearTimeout(id);

	// have to trick lottie into thinking it's running in a browser
	setGlobal("window", window);
	setGlobal("navigator", navigator);
	setGlobal("document", document);
	setGlobal("requestAnimationFrame", requestAnimationFrame);
	setGlobal("cancelAnimationFrame", cancelAnimationFrame);
	setGlobal("setTimeout", timers.setTimeout);
	setGlobal("clearTimeout", timers.clearTimeout);
	setGlobal("setInterval", timers.setInterval);
	setGlobal("clearInterval", timers.clearInterval);
	window.requestAnimationFrame = requestAnimationFrame;
	window.cancelAnimationFrame = cancelAnimationFrame;

	installCanvasMock(window);

	// load the lottie renderer late after globals are set
	const renderToDom = require("./render");

	try {
		return await renderToDom(
			document,
			animationData,
			opts || {},
			frameNumber ?? 0
		);
	} finally {
		timers.clearAll();
		window.close();
		restoreGlobals(globals);
	}
}

module.exports = (animationData, opts, frameNumber) => {
	const queuedRender = renderQueue.then(
		() => render(animationData, opts, frameNumber),
		() => render(animationData, opts, frameNumber)
	);

	renderQueue = queuedRender.catch(() => {});

	return queuedRender;
};
