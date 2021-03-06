'use strict';

var asynEach = require('async-foreach').forEach,
    chalk = require('chalk'),
    fs = require('graceful-fs'),
    globby = require('globby'),
    path = require('path'),
    pkg = require('../package.json'),
    PDF = require('pdfkit'),
    Q = require('q'),
    sizeOf = require('image-size'),
    utils = require('./utils'),
    Website = require('./website');





/**
 * Public: Constructor for PDFShooter
 * @author Steven Britton
 * @date   2016-04-14
 * @param  {Object}  options [description]
 */
var PDFShooter = function(parameters) {

    utils.log.verbose('PDFShooter: constructor', parameters);

    this.options = parameters;
    this.userPDFOptions = parameters.pdf_options;
    this.website = new Website(this.options);

};


function getDate() {

    var d = new Date(),
        date =
        d.getUTCFullYear() + '-' +
        (d.getUTCMonth() + 1) + '-' +
        d.getUTCDate();
    return date;
}


/**
 * Gets all files based on viewport size
 * @author Steven Britton
 * @date   2016-04-26
 * @param  {String}   outputPath Path to generated screenshots
 * @param  {String}   size       Viewport size
 * @return {Array}               Array of paths to images
 */
function getFiles(outputPath, size) {
    return globby.sync([path.join(outputPath, '**', '*' + size + '.png')]);
}

/**
 * Write text to PDF object
 * @author Steven Britton
 * @date   2016-04-25
 * @param  {Object}   pdf        pdf-kit object
 * @param  {String}   title      title header for field
 * @param  {String}   field      field that's part of the cotent collection
 * @param  {String}   fieldColor font color for the field parameter
 */
function writeTextPDF(pdf, title, field, fieldColor) {

    fieldColor = fieldColor || 'black';
    field =  field !== undefined ? field : '';

    pdf.fontSize(30)
        .fillColor('black')
        .text(title);

    pdf.fontSize(20)
        .fillColor(fieldColor)
        .text(field);

    pdf.moveDown();
}


/**
 * Generates a PDF containing the passed array of images along with metadata collected from Siteshooter
 * @author Steven Britton
 * @date   2016-05-10
 * @param  {Object}   pdfShooter
 * @param  {Array}    arrImages
 * @param  {[type]}   dimensions
 * @param  {String}   domainName
 * @param  {String}   outputPath
 * @param  {[type]}   viewport
 * @param  {Function} done
 * @return {Function} callback
 */
function createPDF(pdfShooter, arrImages, dimensions, domainName, outputPath, viewport, done) {

    utils.log.verbose('createPDF', arguments);

    var date = getDate(),
        credit,
        page,
        pdfPath = path.resolve(outputPath, utils.urlToDir(domainName) + '-' + viewport + '-' + date + '.pdf'),
        tempURL,
        writeStream;

    utils.log.verbose('pdfPath', pdfPath);


    credit = 'Siteshooter v' + pkg.version + ' - https://www.devopsgroup.io';

    var pdf = new PDF({
        layout: 'portrait',
        margins: {
            top: 72,
            left: 60,
            right: 72,
            bottom: 20
        }
    });

    writeStream = fs.createWriteStream(pdfPath);

    pdf.pipe(writeStream);

    pdf.pipe(fs.createWriteStream(pdfPath));

    arrImages.forEach(function(png, i) {

        page = png.replace('screenshots/', '');


        // remove from last slash and remaining chars (e.g., /1600.png)
        page = page.substr(0, page.lastIndexOf('/'));

        // get page information stored in website collection
        page = pdfShooter.website.contentCollection.pages.filter(function(item, indx, arr) {

            // remove protocol and last slash
            tempURL = item.loc
                .replace(/^(http|https):\/\//, '')
                .replace(/\/$/, '');

            return (tempURL === page);
        });




        // do we have page specific data?
        if (Array.isArray(page) && page.length > 0) {

            // add site-level information to cover page
            if (i === 0) {

                writeTextPDF(pdf, 'Date', date);

                writeTextPDF(pdf, 'Website', page[0].loc, 'blue');

                writeTextPDF(pdf, 'Viewport', viewport + ' (' + dimensions.width + 'x' + dimensions.height + ')');

                writeTextPDF(pdf, 'Google Analytics Version', page[0].meta.gaVersion);

                writeTextPDF(pdf, 'Number of webpages', arrImages.length);


                // add credit
                /*
                pdf.fontSize(10)
                    .fillColor('black')
                    .text(credit);
                */
            }

            // check page object returned from content collection
            if (page[0] !== undefined && pdfShooter.userPDFOptions.excludeMeta === false) {


                pdf.addPage({
                    size: [sizeOf(png).width, sizeOf(png).height],
                    width: sizeOf(png).width,
                    height: sizeOf(png).height,
                    margins: {
                        top: 72,
                        left: 60,
                        right: 72,
                        bottom: 72
                    }
                });


                // add page specific details
                writeTextPDF(pdf, 'URL', page[0].loc, 'blue');

                writeTextPDF(pdf, 'Meta Title', page[0].meta.title);

                writeTextPDF(pdf, 'Meta Description', page[0].meta.description);

            }
        }

        pdf.addPage({
            size: [sizeOf(png).width, sizeOf(png).height],
            width: sizeOf(png).width,
            height: sizeOf(png).height
        });

        pdf.image(png, 0, 0);
    });

    pdf.end();

    writeStream.on('finish', function() {

        done();

    });

}





PDFShooter.prototype.start = function() {

    console.log(chalk.yellow.bold('\n ⤷ Generating PDFs'));

    var deferred = Q.defer(),
        domainName = this.options.domain.name,
        outputPath = this.options.paths.output,
        pdfs = [],
        pdfShooter = this;


    // load array of viewports and their respective .png files
    pdfs = this.options.viewports.map(function(item, i) {
        return {
            'viewport': item.viewport,
            'dimensions': { 'width': item.width, 'height': item.height },
            'files': getFiles(outputPath, item.width)
        };
    });




    pdfShooter.website.get()

    .then(function() {

        // create individual pdfs based on viewport
        return asynEach(pdfs, function(item, i) {

            var done = this.async();

            // make sure we have some screenshots
            if (item.files.length > 0) {
                createPDF(pdfShooter, item.files, item.dimensions, domainName, outputPath, item.viewport, function() {
                    done();
                });
            } else {

                console.log(chalk.red.bold('   ✗ '), chalk.red('Screenshots for viewport '), chalk.red.bold(item.viewport), chalk.red(' do not exist.'));

                done();
            }

        }, function(success, array) {
            if (success) {
                deferred.resolve(array);

            } else {
                deferred.reject(success);
            }
        });

    });


    return deferred.promise;
};

module.exports = PDFShooter;
