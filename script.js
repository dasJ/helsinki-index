// Settings
var resultsPerPage = 100; // Results per page
var nixosReleases = [ '18.09', 'unstable' ];
var hmReleases = [ 'unstable' ];
var helsinkiUrl = 'https://no-url-yet/';

// Variables
var expanded = null; // Currently expanded object
var optionData = {}; // All option data
var pkgsData = {}; // All packages data
var results = null; // Results of the current search
var isHm = false; // Are we running for home-manager?
var isPkgs = false; // Are we rendering packages?
var currentRelease = nixosReleases[0]; // Currently selected release
var updateTimeout = null; // Timeout until we update again

// Search
function refilter() {
	var key = (isHm ? 'hm-' : '') + currentRelease;
	if (!(key in (isPkgs ? pkgsData : optionData))) {
		return;
	}
	$('#loading-error').hide();
	var dat = (isPkgs ? pkgsData : optionData)[key];

	var query = $('#search').val().toLowerCase().split(/ +/).filter(Boolean);

	results = Object.keys(dat);

	// Handle query
	if (query.length > 0) {
		results = results.filter(function (name) {
			var val = dat[name];

			function matchOption(word) {
				return name.toLowerCase().indexOf(word) != -1
					|| (val.description || '').toLowerCase().indexOf(word) != -1;
			};

			function matchPkg(word) {
				return name.toLowerCase().indexOf(word) != -1
					|| val['name'].toLowerCase().indexOf(word) != -1
					|| (val['meta']['description'] || '').toLowerCase().indexOf(word) != -1
					|| (val['meta']['longDescription'] || '').toLowerCase().indexOf(word) != -1;
			};

			return (isPkgs ? query.every(matchPkg) : query.every(matchOption));
		});
	}

	// Update URL
	var encodedQuery = query.map(function(value) {
		return encodeURIComponent(value);
	});
	var url = (isPkgs ? 'p:' : 'o:') + (isHm ? 'h:' : 'n:') + currentRelease + ':' + encodedQuery.join('+');
	history.replaceState({}, '', '#' + url);

	curPage = 0;
	lastPage = (results.length - 1) / resultsPerPage >> 0;

	updateTable();
}

// Update results table
function updateTable() {
	if (results == null) {
		return;
	}

	// Ensure number is in range
	if (curPage < 0) {
		curPage = 0;
	}
	if (curPage > lastPage) {
		curPage = lastPage;
	}

	// Check which results to show
	var start = curPage * resultsPerPage;
	var end = start + resultsPerPage;
	if (end > results.length) {
		end = results.length;
	}
	var res = results.slice(start, end);

	// Our list
	var listContainer = $('.mdc-list');
	listContainer.empty();

	// Nothing found?
	if (results.length == 0) {
		$('#how-many').html('&nbsp;');
		$('#nothing-found').show();
		$('.paging mdc-button').prop('disabled', true);
		return;
	}
	$('#nothing-found').hide();

	// Update how-many
	$('#how-many').text('Showing results ' + (start + 1) + '-' + end + ' of ' + results.length + '.');

	// Handle paging
	$('.paging-first').prop('disabled', curPage == 0);
	$('.paging-prev').prop('disabled', curPage == 0);
	$('.paging-next').prop('disabled', curPage >= lastPage);
	$('.paging-last').prop('disabled', curPage >= lastPage);

	// Build list
	var data = (isPkgs ? pkgsData : optionData)[(isHm ? 'hm-' : '') + currentRelease];
	res.forEach(function(name) {
		var config = data[name];

		listContainer.append($('<li/>')
			.addClass('mdc-list-item')
			.append($('<div/>')
				.addClass('mdc-list-item__text')
				.addClass('title')
				.text(isPkgs ? config['name'] : name)
				.append((!isPkgs && config['readOnly']) ? $('<span/>').addClass('material-icons').attr('aria-hidden', true).text('lock') : '')
				.append((isPkgs && 'meta' in config && 'broken' in config['meta'] && config['meta']['broken']) ? $('<span/>').addClass('material-icons').attr('aria-hidden', true).text('broken_image') : ''))
			.append($('<div/>')
				.addClass('content')
				.append(isPkgs ? buildPackageTable(name, config) : buildOptionTable(config))
			)
			.append(isPkgs ? $('<div/>')
				.addClass('mdc-list-item__secondary-text')
				.text(('meta' in config && 'description' in config['meta']) ? config['meta']['description'] : '') : '')
			.append(isPkgs ? $('<div/>')
				.addClass('mdc-list-item__meta')
				.text(name) : '')
			.click(function(e) {
				target = $(this).children('.content');

				if (expanded != null && expanded.get(0) != target.get(0)) {
					expanded.slideUp(300);
					expanded.parent().removeClass('expanded');
				}

				target.slideDown(300);
				target.parent().addClass('expanded');
				expanded = target;
			})
		);
	});
	$('.loading').hide();
}

// Build option list
function buildOptionTable(opt) {
	// Prepare description
	var x = $.parseXML('<xml xmlns:xlink="http://www.w3.org/1999/xlink"><para>' + opt.description + '</para></xml>');

	// Replace xlink with `<a>`
	$(x).find('link').each(function(i, el) {
		var link = $(el).attr('xlink:href');
		var inner = el.innerHTML;
		if (inner === '' || !inner) {
			inner = link;
		}
		$($('<a/>', { 'href': link }).html(inner)).replaceAll(el);
	});

	// Replace filenames with `<tt>`
	$(x).find('filename').each(function (i, el) {
		var inner = el.innerHTML;
		$($('<tt></tt>').html(inner)).replaceAll(el);
	});

	// For each [option, literal], replace with equivalent `<code>`
	$(x).find('option, literal').each(function (i, el) {
		var inner = el.innerHTML;
		$($('<code></code>').html(inner)).replaceAll(el);
	});

	// Fixes manpage references.
	$(x).find('citerefentry manvolnum').each(function (i, el) {
		var el = $(el).parent();
		var title = el.children('refentrytitle')[0].innerHTML;
		var volnum = el.children('manvolnum')[0].innerHTML;
		$($('<tt class="man_page"></tt>').html(title + '(' + volnum + ')')).replaceAll(el);
	});

	// Loop for `<para>` inside `<para>`
	var paras = [];
	while ((paras = $(x).find('para')).length > 0) {
		paras.each(function (i, el) {
			var inner = el.innerHTML;
			$($('<p></p>').html(inner)).replaceAll(el);
		});
	}

	// For each [option, literal], replace with equivalent `<code>`
	$(x).find('important').each(function (i, el) {
		var inner = el.innerHTML;
		$($('<div class="docbook-important"></div>').html(inner)).replaceAll(el);
	});

	// Figure out declarations
	var declarations = $('<td/>');
	if ('declarations' in opt && opt['declarations'].length > 0) {
		var first = true;
		opt.declarations.forEach(function(module) {
			var url = '';
			if (module.startsWith('nixos')) {
				url = 'https://github.com/NixOS/nixpkgs/tree/'+ ((currentRelease == 'unstable') ? 'master' : 'release-' + currentRelease) + '/' + module;
			}
			if (module.startsWith('helsinki')) {
				url = helsinkiUrl + module;
			}
			if (isHm) {
				url = 'https://github.com/rycee/home-manager/tree/'+ ((currentRelease == 'unstable') ? 'master' : 'release-' + currentRelease) + '/' + module;
			}
			if (!first) {
				declarations.append(', ');
			}
			first = false;
			declarations.append($('<a/>', { href: url}).text(module));
		});
	}

	return $('<table>')
		// Description
		.append($('<tr/>')
			.append($('<td/>')
				.text('Description'))
			.append($('<td/>')
				.append($(x).contents())
			)
		)
		// Type
		.append($('<tr/>')
			.append($('<td/>')
				.text('Type'))
			.append($('<td/>')
				.addClass('pre')
				.text(('type' in opt) ? opt['type'] : 'Not given')
			)
		)
		// Default
		.append($('<tr/>')
			.append($('<td/>')
				.text('Default'))
			.append($('<td/>')
				.addClass('pre')
				.text(('default' in opt) ? ppNix('', opt['default']) : '')
			)
		)
		// Example
		.append($('<tr/>')
			.append($('<td/>')
				.text('Example'))
			.append($('<td/>')
				.addClass('pre')
				.text(('example' in opt) ? ppNix('', opt['example']) : '')
			)
		)
		// Declarations
		.append($('<tr/>')
			.append($('<td/>')
				.text('Declared in'))
			.append(declarations)
		);
}

// Build option list
function buildPackageTable(attr, pkg) {
	// Prepare expression
	var expression = '';
	if ('meta' in pkg && 'position' in pkg['meta']) {
		var pos = pkg['meta']['position'];
		var pathPart = pos.split('/').slice(4).join('/');

		if (pathPart.startsWith('pkgs')) {
			var url = 'https://github.com/NixOS/nixpkgs/tree/' + ((currentRelease == 'unstable') ? 'master' : 'release-' + currentRelease) + '/' + pathPart.replace(':', '#L');

			expression = $('<a/>', { 'href': url }).text('nixpkgs/' + pathPart);
		}
		if (pos.split('-', 2)[1].startsWith('4pkgs')) {
			url = helsinkiUrl + '4pkgs/' + pathPart;
			expression = $('<a/>', { 'href': url }).text('helsinki/4pkgs/' + pathPart);
		}
	}

	// Prepare platforms
	var platforms = '';
	if ('meta' in pkg && 'platforms' in pkg['meta'] && Array.isArray(pkg['meta']['platforms'])) {
		var platforms = pkg['meta']['platforms'];
		var first = true;
		platforms.forEach(function(system) {
			if (typeof system != 'string') {
				return;
			}
			if (!first) {
				platforms += ', ';
			}
			first = false;
			platforms += system;
		});
	}

	// Prepare homepage
	var homepage = '';
	if ('meta' in pkg && 'homepage' in pkg['meta']) {
		var url = pkg['meta']['homepage'];
		homepage = $('<a/>', { 'href': url }).text(url);
	}

	// Prepare download page
	var downloadPage = '';
	if ('meta' in pkg && 'downloadPage' in pkg['meta']) {
		var url = pkg['meta']['downloadPage'];
		downloadPage = $('<a/>', { 'href': url }).text(url);
	}

	// Prepare license
	var license = '';
	if ('meta' in pkg && 'license' in pkg['meta']) {
		var licenseData = pkg['meta']['license'];
		if (typeof licenseData == 'string') {
			license = $('<span/>').text(licenseData);
		} else {
			license = $('<span/>').text(licenseData.fullName + ' (' + licenseData.shortName + ')');
			license.prepend($('<span/>').addClass('material-icons').attr('aria-hidden', true).text(('free' in licenseData && !licenseData.free) ? 'lock' : 'lock_open'))
		}
	}

	// Prepare maintainers
	var maintainers = '';
	if ('meta' in pkg && 'maintainers' in pkg['meta']) {
		var maintData = pkg['meta']['maintainers'];
		maintainers = $('<span/>');
		var first = true;
		maintData.forEach(function(maintainer) {
			if (!first) {
				maintainers.append(', ');
			}
			// Try to build it together
			var github = maintainer.github;
			var name = maintainer.name || github;
			var mail = ' <' + maintainer.email + '>' || '';
			maintainers.append($('<a/>', { href: 'https://github.com/' + github })
				.text(name));
			maintainers.append($('<span/>').text(mail));
		});
	}

	if ('meta' in pkg) {
		Object.keys(pkg['meta']).forEach(function(key) {
			/*
			 * Ignored attributes:
			 * available
			 * outputsToInstall
			 * hydraPlatforms
			 * isBuildPythonPackage
			 * version
			 * executables
			 * repositories
			 * timeout
			 * isFcitxEngine
			 * isIbusEngine
			 * isGutenprint
			 * badPlatforms
			 * tag
			 * knownVulnerabilities
			 * branch
			 */
			if ([ 'homepage', 'position', 'available', 'description', 'license', 'outputsToInstall', 'name', 'platforms', 'maintainers', 'downloadPage', 'longDescription', 'hydraPlatforms', 'isBuildPythonPackage', 'version', 'priority', 'broken', 'downloadURLRegexp', 'updateWalker', 'branch', 'executables', 'repositories', 'timeout', 'isFcitxEngine', 'isIbusEngine', 'isGutenprint', 'badPlatforms', 'tag', 'knownVulnerabilities' ].includes(key)) {
				return;
			}
			console.log('Encountered unknown attribute ' + key + ' in package ' + attr);

		});
		if ('knownVulnerabilities' in pkg['meta'])
			console.log(pkg['meta']['knownVulnerabilities']);
	}

	return $('<table>')
		// Attribute name
		.append($('<tr/>')
			.append($('<td/>')
				.text('Attribute name'))
			.append($('<td/>')
				.addClass('pre')
				.append(attr)
			)
		)
		// Expression
		.append($('<tr/>')
			.append($('<td/>')
				.text('Expression'))
			.append($('<td/>')
				.append(expression)
			)
		)
		// Platforms
		.append($('<tr/>')
			.append($('<td/>')
				.text('Platforms'))
			.append($('<td/>')
				.append(platforms)
			)
		)
		// Homepage
		.append($('<tr/>')
			.append($('<td/>')
				.text('Homepage'))
			.append($('<td/>')
				.append(homepage)
			)
		)
		// Download page
		.append($('<tr/>')
			.append($('<td/>')
				.text('Download page'))
			.append($('<td/>')
				.append(downloadPage)
			)
		)
		// Download regexp
		.append($('<tr/>')
			.append($('<td/>')
				.text('Download regexp'))
			.append($('<td/>')
				.addClass('pre')
				.text(('meta' in pkg && 'downloadURLRegexp' in pkg['meta']) ? pkg['meta']['downloadURLRegexp'] : '')
			)
		)
		// License
		.append($('<tr/>')
			.append($('<td/>')
				.text('License'))
			.append($('<td/>')
				.append(license)
			)
		)
		// Maintainers
		.append($('<tr/>')
			.append($('<td/>')
				.text('Maintainers'))
			.append($('<td/>')
				.append(maintainers)
			)
		)
		// Priority
		.append($('<tr/>')
			.append($('<td/>')
				.text('Priority'))
			.append($('<td/>')
				.text(('meta' in pkg && 'priority' in pkg['meta']) ? pkg['meta']['priority'] : '')
			)
		)
		// Update walker
		.append($('<tr/>')
			.append($('<td/>')
				.text('Update walker'))
			.append($('<td/>')
				.addClass('pre')
				.text(('meta' in pkg && 'updateWalker' in pkg['meta']) ? pkg['meta']['updateWalker'] : '')
			)
		)
		// Long description
		.append($('<tr/>')
			.append($('<td/>')
				.text('Long description'))
			.append($('<td/>')
				.text(('meta' in pkg && 'longDescription' in pkg['meta']) ? pkg['meta']['longDescription'] : '')
			)
		);
}

// Fill releases
function updateReleases() {
	$('.filter .filter-release').remove();
	var releases = (isPkgs || !isHm) ? nixosReleases : hmReleases;

	var isFirst = true;
	releases.forEach(function(relName) {
		var label = 'release-' + relName.replace('.', '');
		$('.filter').append($('<div/>')
			.addClass('mdc-form-field')
			.addClass('filter-release')
			.append($('<div/>')
				.addClass('mdc-radio')
				.append($('<input/>')
					.attr('type', 'radio')
					.attr('id', label)
					.attr('name', 'release')
					.attr('checked', isFirst)
					.addClass('mdc-radio__native-control'))
					.change(switchRelease(relName))
				.append($('<div/>')
					.addClass('mdc-radio__background')
					.append($('<div/>')
						.addClass('mdc-radio__outer-circle'))
					.append($('<div/>')
						.addClass('mdc-radio__inner-circle'))))
			.append($('<label/>')
				.attr('for', label)
				.text(relName))
			)

		if (isFirst) {
			switchRelease(relName)(null);
		}
		isFirst = false;
	});
}

// Switch release
function switchRelease(relName) {
	return function(e) {
		// Ensure the release exists
		currentRelease = relName;
		var key = (isHm ? 'hm-' : '') + currentRelease;
		if (!(key in (isPkgs ? pkgsData : optionData))) {
			requestRelease();
		} else {
			refilter();
		}
	};
}

// Fetch release data
function requestRelease() {
	$('.loading').show();
	$('#loading-error').hide();

	// Build URL
	var url = '';
	if (isPkgs) {
		url = 'packages-' + currentRelease + '.json';
	} else {
		url = 'options-' + (isHm ? 'hm' : 'nixos') + '-' + currentRelease + '.json';
	}
	// Request
	$.ajax({
		url: url,
		type: 'GET',
		dataType: 'json',
		error: function(xhr, status, error) {
			$('.loading').hide();
			$('#loading-error').show();
			$('.mdc-list').empty();
		},
		success: function(data) {
			if (isPkgs) {
				pkgsData[currentRelease] = data.packages;
			} else {
				var optionKey = (isHm ? 'hm-' : '') + currentRelease;
				optionData[optionKey] = data;
			}
			refilter();
		}
	})
}

// Update the header bar
function updateHeader() {
	if (isPkgs) {
		$('#header-main-text').text('Packages');
		$('#header-nonmain-text').text('Options');
		$('title').text('Helsinki Packages');
		$('#home-manager-field').hide();
	} else {
		$('#header-main-text').text('Options');
		$('#header-nonmain-text').text('Packages');
		$('title').text('Helsinki Options');
		$('#home-manager-field').show();
	}
	updateReleases();
}

// Pretty-print Nix
function ppNix(indent, v) {
	var len = 0;
	var outerIndent = indent;
	indent += '  ';

	function ppRec(v) {
		return ppNix(indent, v);
	};

	function ppIndent(i, firstLine) {
		return i ? indent : firstLine;
	};

	function ppNL(i) {
		return len <= i ? ' ' : '\n';
	}

	function needIndentation(v) {
		if (typeof v == 'object') {
			if (Array.isArray(v)) {
				if (v.some(needIndentation)) {
					return true;
				}
				return false;
			}
			if (Object.keys(v).some(propNeedIndentation(v))) {
				return true;
			}
			return false;
		}
		if (typeof v == 'string') {
			return v.indexOf('"') != -1 || v.indexOf('\n') != -1;
		}
	}

	function propNeedIndentation(obj) {
		return function(key) {
			return needIndentation(obj[key]);
		};
	}

	if (v == null) {
		return 'null';
	}

	if (typeof v == 'object') {
		if (Array.isArray(v)) {
			len = v.length;
			// If none of the element inside it need to have indentation levels, then
			// we can just print the whole array on one line.
			if (!v.some(needIndentation)) {
				if (len == 0) {
					return '[]';
				}
				var res = '[ ';
				for (var i = 0; i < v.length; i++) {
					res += ppNix(indent, v[i]) + ' ';
				}
				return res + ']';
			}

			// Print an array on multiple lines as it contains some complex elements.
			var res = '[';
			for (var i = 0; i < v.length; i++) {
				res += ppIndent(i, ' ') + ppNix(indent, v[i]) + ppNL(1);
			}
			return res + ']';
		}

		if (v._type == 'literalExample') {
			v = ((v.text || '') + '');
			return v;
		}

		// Print an attrset
		var attrset = Object.keys(v);
		len = attrset.length;
		if (!attrset.some(propNeedIndentation(v))) {
			var res = '{ ';
			for (var i = 0; i < len; i++) {
				var attrName = attrset[i];
				var value = v[attrName];
				res += attrName + ' = ';
				res += ppNix(indent, value);
				res += '; ';
			}
			return res + '}';
		}

		var res = '{\n';
		for (var i = 0; i < len; i++) {
			var attrName = attrset[i];
			var value = v[attrName];
			var ni = needIndentation(value);
			res += indent;
			res += attrName + ' =' + (ni ? '\n' + indent + '  ' : ' ')
			res += ppNix(indent + '  ', value);
			res += ';\n';
		}
		return res + outerIndent + '}';
	}

	if (typeof v == 'string') {
		if (v.indexOf('"') == -1 && v.indexOf('\n') == -1) {
			if (/^pkgs\./.test(v))
				return '' + v;
			return '"' + v + '"';
		}
		var lines = v.split('\n');
		var res = "''\n";
		for (var i = 0; i < lines.length; i++) {
			res += indent + lines[i] + '\n';
		}
		return res + outerIndent + "''";
	}
	return '' + v;
}

// Read back old query
var query = decodeURIComponent(document.location.hash.replace(/^#\+*/, '').replace(/\+/g, ' ')).split(':');
if (query.length >= 1 && query[0] == 'p') {
	// options/pkgs
	isPkgs = true;
	updateHeader();
}
if (query.length >= 2 && query[1] == 'h') {
	// home-manager
	$('#home-manager').prop('checked', 1)
	isHm = true;
}
if (query.length >= 3) {
	// Release
	// TODO
}
if (query.length >= 4) {
	// Query
	$('#search').val(query[3]);
}
// Initialize data
updateReleases();

// Listeners
$('#switch-opts-pkgs').on('click', function() {
	isPkgs = !isPkgs;
	updateHeader();
});
$('#search').on('change', function() {
	refilter();
});
$('#search').on('input', function() {
	if (updateTimeout != null) {
		window.clearTimeout(updateTimeout);
	}
	updateTimeout = window.setTimeout(function() {
		refilter();
	}, 200);
});
$('#home-manager').on('change', function() {
	isHm = $(this).is(':checked');
	updateReleases();
});

$('.paging-first').on('click', function() {
	curPage = 0;
	updateTable();
});
$('.paging-prev').on('click', function() {
	curPage--;
	updateTable();
});
$('.paging-next').on('click', function() {
	curPage++;
	updateTable();
});
$('.paging-last').on('click', function() {
	curPage = lastPage;
	updateTable();
});

// Attach MDC
mdc.textField.MDCTextField.attachTo(document.querySelector('.mdc-text-field'));
